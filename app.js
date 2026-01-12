class WarehouseApp {
    constructor() {
        this.currentTab = 'add';
        this.selectedProduct = null;
        this.products = [];
        this.operations = [];
        
        this.initializeApp();
    }

    initializeApp() {
        // Инициализация вкладок
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e));
        });

        // Инициализация форм
        document.getElementById('addForm').addEventListener('submit', (e) => this.handleAddProduct(e));
        document.getElementById('sellForm').addEventListener('submit', (e) => this.handleSellProduct(e));
        document.getElementById('searchBtn').addEventListener('click', () => this.searchProducts());
        document.getElementById('refreshStock').addEventListener('click', () => this.loadStock());
        document.getElementById('exportStock').addEventListener('click', () => this.exportStock());
        document.getElementById('backupData').addEventListener('click', () => this.backupData());
        document.getElementById('testConnection').addEventListener('click', () => this.testConnection());
        document.getElementById('saveSettings').addEventListener('click', () => this.saveSettings());
        document.getElementById('applyFilter').addEventListener('click', () => this.loadHistory());
        
        // Инициализация поиска
        document.getElementById('stockSearch').addEventListener('input', (e) => this.filterStock(e));
        document.getElementById('searchProduct').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.searchProducts();
            }
        });

        // Инициализация модального окна
        document.querySelector('.close-modal').addEventListener('click', () => this.hideModal());

        // Загрузка данных
        this.loadSettings();
        this.loadStock();
        this.loadHistory();

        // Показ уведомления при загрузке
        this.showNotification('Система управления складом загружена!', 'success');
    }

    switchTab(e) {
        const tabId = e.target.dataset.tab;
        
        // Обновление активной кнопки
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        e.target.classList.add('active');

        // Обновление активного контента
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabId).classList.add('active');

        this.currentTab = tabId;

        // Загрузка данных при переключении на вкладку
        if (tabId === 'stock') {
            this.loadStock();
        } else if (tabId === 'history') {
            this.loadHistory();
        }
    }

    async handleAddProduct(e) {
        e.preventDefault();
        
        const product = {
            name: document.getElementById('productName').value,
            code: document.getElementById('productCode').value,
            category: document.getElementById('category').value,
            quantity: parseInt(document.getElementById('quantity').value),
            price: parseFloat(document.getElementById('price').value) || 0,
            supplier: document.getElementById('supplier').value,
            notes: document.getElementById('notes').value,
            date: new Date().toISOString(),
            type: 'приход'
        };

        try {
            await googleSheetsAPI.addProduct(product);
            this.showNotification(`Товар "${product.name}" добавлен на склад!`, 'success');
            
            // Очистка формы
            e.target.reset();
            document.getElementById('quantity').value = 1;
            
            // Обновление остатков
            this.loadStock();
            this.loadHistory();
            
        } catch (error) {
            this.showNotification('Ошибка при добавлении товара: ' + error.message, 'error');
        }
    }

    async handleSellProduct(e) {
        e.preventDefault();
        
        if (!this.selectedProduct) {
            this.showNotification('Выберите товар для отпуска', 'warning');
            return;
        }

        const quantity = parseInt(document.getElementById('sellQuantity').value);
        const clientName = document.getElementById('clientName').value;
        const clientPhone = document.getElementById('clientPhone').value;

        if (quantity > this.selectedProduct.quantity) {
            this.showNotification('Недостаточно товара на складе!', 'error');
            return;
        }

        const operation = {
            productId: this.selectedProduct.id,
            productName: this.selectedProduct.name,
            productCode: this.selectedProduct.code,
            quantity: quantity,
            clientName: clientName,
            clientPhone: clientPhone,
            date: new Date().toISOString(),
            type: 'расход'
        };

        try {
            await googleSheetsAPI.sellProduct(operation);
            this.showNotification(`Отпущено ${quantity} ед. товара "${this.selectedProduct.name}"`, 'success');
            
            // Очистка формы
            e.target.reset();
            document.getElementById('selectedProduct').classList.add('hidden');
            document.getElementById('searchResults').classList.add('hidden');
            this.selectedProduct = null;
            
            // Обновление данных
            this.loadStock();
            this.loadHistory();
            
        } catch (error) {
            this.showNotification('Ошибка при отпуске товара: ' + error.message, 'error');
        }
    }

    async searchProducts() {
        const query = document.getElementById('searchProduct').value.toLowerCase();
        
        if (!query) {
            this.showNotification('Введите поисковый запрос', 'warning');
            return;
        }

        try {
            const products = await googleSheetsAPI.getProducts();
            const filteredProducts = products.filter(p => 
                p.name.toLowerCase().includes(query) || 
                p.code.toLowerCase().includes(query)
            );

            this.displaySearchResults(filteredProducts);
            
        } catch (error) {
            this.showNotification('Ошибка при поиске товаров', 'error');
        }
    }

    displaySearchResults(products) {
        const container = document.getElementById('productsList');
        container.innerHTML = '';

        if (products.length === 0) {
            container.innerHTML = '<p class="no-results">Товары не найдены</p>';
            document.getElementById('searchResults').classList.remove('hidden');
            return;
        }

        products.forEach(product => {
            const div = document.createElement('div');
            div.className = 'product-card';
            div.innerHTML = `
                <div class="product-info">
                    <strong>${product.name}</strong>
                    <div>Артикул: ${product.code}</div>
                    <div>Категория: ${product.category}</div>
                    <div>В наличии: <span class="stock-badge ${this.getStockClass(product.quantity)}">
                        ${product.quantity} ед.
                    </span></div>
                    <button class="btn btn-primary select-product" 
                            data-id="${product.id}"
                            style="margin-top: 10px;">
                        <i class="fas fa-check"></i> Выбрать
                    </button>
                </div>
            `;
            container.appendChild(div);
        });

        document.getElementById('searchResults').classList.remove('hidden');

        // Добавляем обработчики для кнопок выбора
        document.querySelectorAll('.select-product').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = e.target.closest('.select-product').dataset.id;
                this.selectProduct(productId, products);
            });
        });
    }

    async selectProduct(productId, products) {
        const product = products.find(p => p.id == productId);
        
        if (!product) return;

        this.selectedProduct = product;
        
        document.getElementById('selectedName').textContent = product.name;
        document.getElementById('selectedCode').textContent = product.code;
        document.getElementById('selectedStock').textContent = `${product.quantity} ед.`;
        document.getElementById('selectedStock').className = `stock-badge ${this.getStockClass(product.quantity)}`;
        
        document.getElementById('sellQuantity').max = product.quantity;
        document.getElementById('sellQuantity').value = Math.min(1, product.quantity);
        
        document.getElementById('selectedProduct').classList.remove('hidden');
        document.getElementById('searchResults').classList.add('hidden');
    }

    getStockClass(quantity) {
        if (quantity > 20) return 'high';
        if (quantity > 5) return 'medium';
        return 'low';
    }

    async loadStock() {
        try {
            this.products = await googleSheetsAPI.getProducts();
            this.displayStock();
            this.updateStats();
        } catch (error) {
            this.showNotification('Ошибка при загрузке остатков', 'error');
        }
    }

    displayStock() {
        const tbody = document.getElementById('stockBody');
        tbody.innerHTML = '';

        this.products.forEach(product => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${product.code}</td>
                <td>${product.name}</td>
                <td>${product.category}</td>
                <td>${product.quantity}</td>
                <td>${product.price ? product.price.toFixed(2) + ' ₽' : '-'}</td>
                <td>
                    <span class="stock-badge ${this.getStockClass(product.quantity)}">
                        ${this.getStockStatus(product.quantity)}
                    </span>
                </td>
                <td>
                    <button class="btn btn-secondary btn-sm" 
                            onclick="app.showProductDetails('${product.id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    filterStock(e) {
        const query = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('#stockBody tr');
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(query) ? '' : 'none';
        });
    }

    getStockStatus(quantity) {
        if (quantity > 20) return 'В наличии';
        if (quantity > 5) return 'Мало';
        return 'Критично';
    }

    updateStats() {
        const totalItems = this.products.length;
        const totalQuantity = this.products.reduce((sum, p) => sum + p.quantity, 0);
        const lowStock = this.products.filter(p => p.quantity <= 5).length;

        document.getElementById('totalItems').textContent = totalItems;
        document.getElementById('totalQuantity').textContent = totalQuantity;
        document.getElementById('lowStock').textContent = lowStock;
    }

    async loadHistory() {
        try {
            const typeFilter = document.getElementById('filterType').value;
            const dateFrom = document.getElementById('filterDateFrom').value;
            const dateTo = document.getElementById('filterDateTo').value;

            this.operations = await googleSheetsAPI.getOperations();
            
            // Фильтрация
            let filtered = this.operations;
            
            if (typeFilter !== 'all') {
                filtered = filtered.filter(op => op.type === typeFilter);
            }
            
            if (dateFrom) {
                filtered = filtered.filter(op => new Date(op.date) >= new Date(dateFrom));
            }
            
            if (dateTo) {
                const toDate = new Date(dateTo);
                toDate.setHours(23, 59, 59);
                filtered = filtered.filter(op => new Date(op.date) <= toDate);
            }

            this.displayHistory(filtered);
        } catch (error) {
            this.showNotification('Ошибка при загрузке истории', 'error');
        }
    }

    displayHistory(operations) {
        const tbody = document.getElementById('historyBody');
        tbody.innerHTML = '';

        operations.forEach(op => {
            const date = new Date(op.date).toLocaleString('ru-RU');
            const typeClass = op.type === 'приход' ? 'success' : 'error';
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${date}</td>
                <td>
                    <span class="stock-badge ${typeClass}">
                        ${op.type === 'приход' ? '📥 Приход' : '📤 Расход'}
                    </span>
                </td>
                <td>${op.productName} (${op.productCode})</td>
                <td>${op.quantity} ед.</td>
                <td>${op.clientName || op.supplier || '-'}</td>
                <td>${op.responsible || 'Система'}</td>
            `;
            tbody.appendChild(row);
        });
    }

    async testConnection() {
        try {
            const sheetId = document.getElementById('sheetId').value;
            const sheetName = document.getElementById('sheetName').value;
            
            if (!sheetId) {
                this.showNotification('Введите ID таблицы', 'warning');
                return;
            }

            const isConnected = await googleSheetsAPI.testConnection(sheetId, sheetName);
            
            const statusDiv = document.getElementById('connectionStatus');
            if (isConnected) {
                statusDiv.textContent = '✅ Подключение успешно! Таблица готова к использованию.';
                statusDiv.className = 'status success';
            } else {
                statusDiv.textContent = '❌ Ошибка подключения. Проверьте ID таблицы и настройки доступа.';
                statusDiv.className = 'status error';
            }
            statusDiv.classList.remove('hidden');
            
        } catch (error) {
            this.showNotification('Ошибка при тестировании подключения: ' + error.message, 'error');
        }
    }

    saveSettings() {
        const sheetId = document.getElementById('sheetId').value;
        const sheetName = document.getElementById('sheetName').value;
        
        localStorage.setItem('warehouse_sheetId', sheetId);
        localStorage.setItem('warehouse_sheetName', sheetName);
        
        this.showNotification('Настройки сохранены!', 'success');
        
        // Обновляем API
        googleSheetsAPI.initialize(sheetId, sheetName);
    }

    loadSettings() {
        const sheetId = localStorage.getItem('warehouse_sheetId');
        const sheetName = localStorage.getItem('warehouse_sheetName') || 'Склад';
        
        if (sheetId) {
            document.getElementById('sheetId').value = sheetId;
            document.getElementById('sheetName').value = sheetName;
            googleSheetsAPI.initialize(sheetId, sheetName);
        }
    }

    async exportStock() {
        try {
            const data = this.products.map(p => ({
                'Артикул': p.code,
                'Наименование': p.name,
                'Категория': p.category,
                'Количество': p.quantity,
                'Цена': p.price || 0,
                'Статус': this.getStockStatus(p.quantity)
            }));

            // Создаем CSV
            const headers = Object.keys(data[0] || {});
            const csv = [
                headers.join(','),
                ...data.map(row => headers.map(h => `"${row[h]}"`).join(','))
            ].join('\n');

            // Создаем и скачиваем файл
            const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `остатки_склада_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showNotification('Данные экспортированы в CSV файл', 'success');
        } catch (error) {
            this.showNotification('Ошибка при экспорте данных', 'error');
        }
    }

    async backupData() {
        try {
            const allData = {
                products: this.products,
                operations: this.operations,
                backupDate: new Date().toISOString()
            };

            const dataStr = JSON.stringify(allData, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `backup_склад_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showNotification('Резервная копия создана успешно!', 'success');
        } catch (error) {
            this.showNotification('Ошибка при создании резервной копии', 'error');
        }
    }

    showProductDetails(productId) {
        const product = this.products.find(p => p.id == productId);
        if (!product) return;

        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <div class="product-details">
                <h4>${product.name}</h4>
                <p><strong>Артикул:</strong> ${product.code}</p>
                <p><strong>Категория:</strong> ${product.category}</p>
                <p><strong>Количество на складе:</strong> ${product.quantity} ед.</p>
                <p><strong>Цена:</strong> ${product.price ? product.price.toFixed(2) + ' ₽' : 'не указана'}</p>
                <p><strong>Поставщик:</strong> ${product.supplier || 'не указан'}</p>
                <p><strong>Примечания:</strong> ${product.notes || 'нет'}</p>
                <p><strong>Статус:</strong> <span class="stock-badge ${this.getStockClass(product.quantity)}">
                    ${this.getStockStatus(product.quantity)}
                </span></p>
            </div>
        `;

        document.getElementById('modalTitle').textContent = 'Детали товара';
        document.getElementById('modal').classList.remove('hidden');
    }

    hideModal() {
        document.getElementById('modal').classList.add('hidden');
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.remove('hidden');

        setTimeout(() => {
            notification.classList.add('hidden');
        }, 3000);
    }
}

// Инициализация приложения
let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new WarehouseApp();
});