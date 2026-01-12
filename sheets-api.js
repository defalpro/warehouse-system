class GoogleSheetsAPI {
    constructor() {
        this.CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com'; // Замените на ваш Client ID
        this.API_KEY = 'YOUR_API_KEY'; // Замените на ваш API Key
        this.DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
        this.SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
        
        this.sheetId = null;
        this.sheetName = 'Склад';
        this.tokenClient = null;
        this.gapiInited = false;
        this.gisInited = false;
        
        this.initializeGAPI();
    }

    initialize(sheetId, sheetName = 'Склад') {
        this.sheetId = sheetId;
        this.sheetName = sheetName;
    }

    async initializeGAPI() {
        await new Promise((resolve) => {
            gapi.load('client', async () => {
                await gapi.client.init({
                    apiKey: this.API_KEY,
                    discoveryDocs: [this.DISCOVERY_DOC],
                });
                this.gapiInited = true;
                this.maybeEnableButtons();
                resolve();
            });
        });
    }

    initializeGIS() {
        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: this.CLIENT_ID,
            scope: this.SCOPES,
            callback: '', // будет установлен позже
        });
        this.gisInited = true;
        this.maybeEnableButtons();
    }

    maybeEnableButtons() {
        if (this.gapiInited && this.gisInited) {
            document.getElementById('authButton').onclick = () => this.handleAuthClick();
        }
    }

    async handleAuthClick() {
        if (!this.tokenClient) {
            this.initializeGIS();
        }

        this.tokenClient.callback = async (resp) => {
            if (resp.error !== undefined) {
                throw new Error(resp.error);
            }
            document.getElementById('authButton').classList.add('hidden');
            document.getElementById('userInfo').classList.remove('hidden');
            document.getElementById('userName').textContent = 'Пользователь Google';
        };

        if (gapi.client.getToken() === null) {
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            this.tokenClient.requestAccessToken({ prompt: '' });
        }
    }

    async testConnection(sheetId, sheetName) {
        if (!sheetId) return false;
        
        try {
            const response = await gapi.client.sheets.spreadsheets.get({
                spreadsheetId: sheetId,
            });
            
            // Проверяем существование листа
            const sheetExists = response.result.sheets.some(
                sheet => sheet.properties.title === sheetName
            );
            
            if (!sheetExists) {
                // Создаем новый лист
                await this.createSheet(sheetId, sheetName);
            }
            
            return true;
        } catch (error) {
            console.error('Connection test failed:', error);
            return false;
        }
    }

    async createSheet(sheetId, sheetName) {
        try {
            await gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: sheetId,
                resource: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: sheetName
                            }
                        }
                    }]
                }
            });

            // Создаем заголовки
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: sheetId,
                range: `${sheetName}!A1:F1`,
                valueInputOption: 'RAW',
                resource: {
                    values: [['ID', 'Наименование', 'Артикул', 'Категория', 'Количество', 'Цена', 'Поставщик', 'Примечания', 'Дата добавления']]
                }
            });
        } catch (error) {
            throw new Error('Не удалось создать лист: ' + error.message);
        }
    }

    async getProducts() {
        if (!this.sheetId) {
            throw new Error('Не указан ID таблицы. Настройте подключение в настройках.');
        }

        try {
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: `${this.sheetName}!A2:J`,
            });

            const rows = response.result.values || [];
            return rows.map((row, index) => ({
                id: index + 1,
                name: row[1] || '',
                code: row[2] || '',
                category: row[3] || '',
                quantity: parseInt(row[4]) || 0,
                price: parseFloat(row[5]) || 0,
                supplier: row[6] || '',
                notes: row[7] || '',
                dateAdded: row[8] || ''
            }));
        } catch (error) {
            throw new Error('Ошибка при загрузке товаров: ' + error.message);
        }
    }

    async addProduct(product) {
        if (!this.sheetId) {
            throw new Error('Не указан ID таблицы');
        }

        try {
            // Получаем последний ID
            const products = await this.getProducts();
            const newId = products.length + 1;

            const values = [
                [
                    newId,
                    product.name,
                    product.code,
                    product.category,
                    product.quantity,
                    product.price,
                    product.supplier,
                    product.notes,
                    new Date().toLocaleString('ru-RU')
                ]
            ];

            await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: this.sheetId,
                range: `${this.sheetName}!A2:I`,
                valueInputOption: 'USER_ENTERED',
                resource: { values }
            });

            // Записываем в историю
            await this.addToHistory({
                ...product,
                operation: 'приход',
                date: new Date().toISOString(),
                responsible: 'Система'
            });

        } catch (error) {
            throw new Error('Ошибка при добавлении товара: ' + error.message);
        }
    }

    async sellProduct(operation) {
        if (!this.sheetId) {
            throw new Error('Не указан ID таблицы');
        }

        try {
            // Обновляем количество
            const products = await this.getProducts();
            const productIndex = products.findIndex(p => p.code === operation.productCode);
            
            if (productIndex === -1) {
                throw new Error('Товар не найден');
            }

            const newQuantity = products[productIndex].quantity - operation.quantity;
            
            if (newQuantity < 0) {
                throw new Error('Недостаточно товара на складе');
            }

            // Обновляем строку в таблице
            const rowNumber = productIndex + 2; // +2 потому что заголовок и нумерация с 1
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: this.sheetId,
                range: `${this.sheetName}!E${rowNumber}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [[newQuantity]] }
            });

            // Записываем в историю
            await this.addToHistory({
                ...operation,
                operation: 'расход',
                date: new Date().toISOString(),
                responsible: 'Система'
            });

        } catch (error) {
            throw new Error('Ошибка при отпуске товара: ' + error.message);
        }
    }

    async addToHistory(operation) {
        try {
            // Создаем или получаем лист истории
            const historySheetName = 'История';
            const sheetExists = await this.checkSheetExists(historySheetName);
            
            if (!sheetExists) {
                await this.createHistorySheet(historySheetName);
            }

            const values = [
                [
                    new Date().toLocaleString('ru-RU'),
                    operation.type,
                    operation.productName,
                    operation.productCode,
                    operation.quantity,
                    operation.clientName || operation.supplier || '',
                    operation.responsible
                ]
            ];

            await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: this.sheetId,
                range: `${historySheetName}!A2:G`,
                valueInputOption: 'USER_ENTERED',
                resource: { values }
            });

        } catch (error) {
            console.error('Error adding to history:', error);
        }
    }

    async checkSheetExists(sheetName) {
        try {
            const response = await gapi.client.sheets.spreadsheets.get({
                spreadsheetId: this.sheetId,
            });
            
            return response.result.sheets.some(
                sheet => sheet.properties.title === sheetName
            );
        } catch (error) {
            return false;
        }
    }

    async createHistorySheet(sheetName) {
        await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.sheetId,
            resource: {
                requests: [{
                    addSheet: {
                        properties: { title: sheetName }
                    }
                }]
            }
        });

        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: this.sheetId,
            range: `${sheetName}!A1:G1`,
            valueInputOption: 'RAW',
            resource: {
                values: [['Дата', 'Тип операции', 'Наименование', 'Артикул', 'Количество', 'Клиент/Поставщик', 'Ответственный']]
            }
        });
    }

    async getOperations() {
        if (!this.sheetId) return [];

        try {
            const historySheetName = 'История';
            const sheetExists = await this.checkSheetExists(historySheetName);
            
            if (!sheetExists) return [];

            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: `${historySheetName}!A2:G`,
            });

            const rows = response.result.values || [];
            return rows.map(row => ({
                date: row[0],
                type: row[1],
                productName: row[2],
                productCode: row[3],
                quantity: parseInt(row[4]) || 0,
                clientName: row[5] || '',
                responsible: row[6] || ''
            }));
        } catch (error) {
            console.error('Error loading operations:', error);
            return [];
        }
    }
}

// Создаем глобальный экземпляр API
const googleSheetsAPI = new GoogleSheetsAPI();