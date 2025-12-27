// ===== КОНСТАНТЫ И ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====
const APP_VERSION = '2.0';
const STORAGE_KEYS = {
    TRANSFERS: 'kbt_v2_transfers',
    QR_CODES: 'kbt_v2_qrcodes',
    SETTINGS: 'kbt_v2_settings',
    LOGS: 'kbt_v2_logs'
};

let state = {
    currentMode: 'transfer',
    transferData: [],
    qrCodes: [],
    settings: {
        beep: true,
        vibrate: true,
        autoSave: true,
        fontSize: 'medium',
        autoExport: '0',
        theme: 'dark'
    },
    appLog: [],
    isScanning: false,
    activeScanner: null,
    selectedQRs: new Set(),
    sortOrder: 'desc'
};

// ===== СИСТЕМА ЛОГГИРОВАНИЯ =====
class Logger {
    static add(message, type = 'info', data = null) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            message,
            type,
            data,
            mode: state.currentMode,
            userAgent: navigator.userAgent,
            platform: navigator.platform
        };
        
        state.appLog.unshift(logEntry);
        
        // Ограничиваем размер лога
        if (state.appLog.length > 1000) {
            state.appLog = state.appLog.slice(0, 500);
        }
        
        // Сохраняем в localStorage
        try {
            localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(state.appLog.slice(0, 200)));
        } catch (e) {}
        
        // Выводим в консоль
        const consoleMethod = {
            error: console.error,
            warn: console.warn,
            info: console.log,
            success: console.log
        }[type] || console.log;
        
        const icon = {
            error: '❌',
            warn: '⚠️',
            info: 'ℹ️',
            success: '✅'
        }[type];
        
        consoleMethod(`${icon} [${new Date().toLocaleTimeString('ru-RU')}] ${message}`, data || '');
        
        // Обновляем UI если нужно
        if (type === 'error' || type === 'warn') {
            UI.showNotification(message, type);
        }
    }
    
    static download() {
        const logData = {
            app: 'KBT Utilities',
            version: APP_VERSION,
            exportDate: new Date().toISOString(),
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            logs: state.appLog,
            state: {
                transferData: state.transferData,
                qrCodes: state.qrCodes,
                settings: state.settings
            }
        };
        
        const blob = new Blob([JSON.stringify(logData, null, 2)], { 
            type: 'application/json' 
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kbt_log_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        UI.showNotification('Лог скачан', 'success');
        Logger.add('Лог приложения скачан', 'info');
    }
}

// ===== УПРАВЛЕНИЕ ИНТЕРФЕЙСОМ =====
class UI {
    static init() {
        this.loadState();
        this.setupEventListeners();
        this.updateStats();
        this.checkStorage();
        this.setupTheme();
        this.setupScannerCompatibility();
        
        Logger.add('Приложение инициализировано', 'success', {
            version: APP_VERSION,
            transfers: state.transferData.length,
            qrCodes: state.qrCodes.length
        });
    }
    
    static loadState() {
        try {
            // Загружаем данные
            const transfers = localStorage.getItem(STORAGE_KEYS.TRANSFERS);
            const qrCodes = localStorage.getItem(STORAGE_KEYS.QR_CODES);
            const settings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
            const logs = localStorage.getItem(STORAGE_KEYS.LOGS);
            
            if (transfers) state.transferData = JSON.parse(transfers);
            if (qrCodes) state.qrCodes = JSON.parse(qrCodes);
            if (settings) state.settings = { ...state.settings, ...JSON.parse(settings) };
            if (logs) state.appLog = JSON.parse(logs);
            
            // Конвертируем старые данные если нужно
            this.migrateOldData();
            
        } catch (error) {
            Logger.add('Ошибка загрузки состояния', 'error', { error: error.message });
        }
    }
    
    static saveState() {
        try {
            localStorage.setItem(STORAGE_KEYS.TRANSFERS, JSON.stringify(state.transferData));
            localStorage.setItem(STORAGE_KEYS.QR_CODES, JSON.stringify(state.qrCodes));
            localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
        } catch (error) {
            Logger.add('Ошибка сохранения состояния', 'error', { error: error.message });
        }
    }
    
    static migrateOldData() {
        // Конвертация из старого формата
        if (state.transferData.length > 0 && typeof state.transferData[0] === 'string') {
            state.transferData = state.transferData.map((number, index) => ({
                id: Date.now() - index,
                number: number,
                timestamp: new Date().toISOString(),
                dateDisplay: new Date().toLocaleString('ru-RU'),
                date: new Date()
            }));
            this.saveState();
            Logger.add('Данные мигрированы в новый формат', 'info');
        }
    }
    
    static setupEventListeners() {
        // Переключение режимов
        document.querySelectorAll('.mode-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const mode = tab.dataset.mode;
                this.switchMode(mode);
            });
        });
        
        // Кнопки сканера передач
        document.getElementById('startTransferScan').addEventListener('click', () => Scanner.start('transfer'));
        document.getElementById('stopTransferScan').addEventListener('click', () => Scanner.stop());
        
        // Кнопки сканера QR
        document.getElementById('startGenericScan').addEventListener('click', () => Scanner.start('generic'));
        document.getElementById('stopGenericScan').addEventListener('click', () => Scanner.stop());
        
        // Тема
        document.getElementById('themeToggle').addEventListener('click', this.toggleTheme);
        
        // Меню
        document.getElementById('menuToggle').addEventListener('click', this.toggleMenu);
        
        // Экспорт/Импорт
        document.getElementById('exportAllBtn').addEventListener('click', DataManager.exportAll);
        document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile')?.click());
        document.getElementById('exportBtn').addEventListener('click', DataManager.exportCSV);
        document.getElementById('downloadLogBtn').addEventListener('click', Logger.download);
        
        // Очистка
        document.getElementById('clearTransfersBtn').addEventListener('click', DataManager.clearTransfers);
        document.getElementById('clearQRCodesBtn').addEventListener('click', DataManager.clearQRCodes);
        
        // Поиск
        const searchInput = document.getElementById('searchTransfers');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterTransfers(e.target.value));
        }
        
        // Сортировка
        document.getElementById('sortByDate').addEventListener('click', () => {
            state.sortOrder = state.sortOrder === 'desc' ? 'asc' : 'desc';
            this.renderTransferHistory();
            this.showNotification(`Сортировка: ${state.sortOrder === 'desc' ? 'по убыванию' : 'по возрастанию'}`, 'info');
        });
        
        // Закрытие меню при клике вне его
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('dropdownMenu');
            const menuToggle = document.getElementById('menuToggle');
            if (menu?.classList.contains('show') && 
                !menu.contains(e.target) && 
                !menuToggle.contains(e.target)) {
                menu.classList.remove('show');
            }
        });
        
        // Проверка соединения
        window.addEventListener('online', () => this.updateConnectionStatus(true));
        window.addEventListener('offline', () => this.updateConnectionStatus(false));
        
        // Сохранение при закрытии
        window.addEventListener('beforeunload', () => {
            if (state.isScanning) Scanner.stop();
            this.saveState();
        });
    }
    
    static switchMode(mode) {
        if (state.currentMode === mode) return;
        
        // Останавливаем сканер
        if (state.isScanning) {
            Scanner.stop();
        }
        
        // Обновляем UI
        document.querySelectorAll('.mode-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.mode === mode);
        });
        
        document.querySelectorAll('.scanner-section').forEach(section => {
            section.classList.toggle('active', section.id === `${mode}-scanner`);
        });
        
        state.currentMode = mode;
        Logger.add(`Режим изменен: ${mode === 'transfer' ? 'Сканер передач' : 'Сканер QR'}`, 'info');
    }
    
    static toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        state.settings.theme = newTheme;
        UI.saveState();
        
        const icon = document.querySelector('#themeToggle i');
        icon.className = newTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
        
        Logger.add(`Тема изменена: ${newTheme}`, 'info');
        UI.showNotification(`Тема: ${newTheme === 'dark' ? 'Тёмная' : 'Светлая'}`, 'success');
    }
    
    static setupTheme() {
        const savedTheme = state.settings.theme || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        const icon = document.querySelector('#themeToggle i');
        icon.className = savedTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
    }
    
    static toggleMenu() {
        const menu = document.getElementById('dropdownMenu');
        menu.classList.toggle('show');
    }
    
    static updateStats() {
        const transfersCount = state.transferData.length;
        const qrCount = state.qrCodes.length;
        
        document.getElementById('statsCount').textContent = `${transfersCount}/${qrCount}`;
        document.getElementById('transfersCount').textContent = `Всего: ${transfersCount}`;
        document.getElementById('qrCodesCount').textContent = `${qrCount} кодов`;
        
        if (transfersCount > 0) {
            const lastTransfer = state.transferData[0];
            const lastDate = new Date(lastTransfer.timestamp);
            document.getElementById('lastScanTime').textContent = 
                `Последнее: ${lastDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
        }
    }
    
    static checkStorage() {
        try {
            const total = JSON.stringify(state).length;
            const usedKB = Math.round(total / 1024);
            const limitKB = 5 * 1024; // 5MB лимит
            
            document.getElementById('storageInfo').innerHTML = 
                `<i class="fas fa-hdd"></i> <span>Память: ${usedKB}KB / ${limitKB}KB</span>`;
            
            if (usedKB > limitKB * 0.9) {
                UI.showNotification('Мало свободной памяти!', 'warning');
            }
        } catch (error) {
            Logger.add('Ошибка проверки хранилища', 'error', { error: error.message });
        }
    }
    
    static updateConnectionStatus(isOnline) {
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
            const icon = statusEl.querySelector('i');
            const text = statusEl.querySelector('span');
            
            if (isOnline) {
                icon.className = 'fas fa-wifi';
                icon.style.color = 'var(--secondary-color)';
                text.textContent = 'Онлайн • Данные сохраняются локально';
            } else {
                icon.className = 'fas fa-wifi-slash';
                icon.style.color = 'var(--danger-color)';
                text.textContent = 'Офлайн • Работа в автономном режиме';
            }
        }
    }
    
    static filterTransfers(query) {
        const filtered = state.transferData.filter(item => 
            item.number.includes(query)
        );
        this.renderTransferHistory(filtered);
    }
    
    static renderTransferHistory(data = state.transferData) {
        const container = document.getElementById('transfer-history');
        if (!container) return;
        
        // Сортируем
        const sorted = [...data].sort((a, b) => {
            const dateA = new Date(a.timestamp);
            const dateB = new Date(b.timestamp);
            return state.sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
        });
        
        if (sorted.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>Нет отсканированных передач</p>
                    <small>Отсканируйте QR-код в формате $1:1:XXXXXXXXXX:</small>
                </div>
            `;
            return;
        }
        
        container.innerHTML = sorted.map((item, index) => `
            <div class="transfer-item" data-id="${item.id}">
                <div class="transfer-info">
                    <div class="transfer-number">${item.number}</div>
                    <div class="transfer-date">${new Date(item.timestamp).toLocaleString('ru-RU')}</div>
                </div>
                <div class="transfer-actions">
                    <button class="action-btn copy-btn" title="Копировать">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="action-btn delete-btn" title="Удалить">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
        // Добавляем обработчики
        container.querySelectorAll('.copy-btn').forEach((btn, index) => {
            btn.addEventListener('click', () => {
                const number = sorted[index].number;
                navigator.clipboard.writeText(number);
                UI.showNotification('Номер скопирован', 'success');
            });
        });
        
        container.querySelectorAll('.delete-btn').forEach((btn, index) => {
            btn.addEventListener('click', () => {
                DataManager.deleteTransfer(sorted[index].id);
            });
        });
    }
    
    static renderQRCodesGallery() {
        const gallery = document.getElementById('qrcode-gallery');
        if (!gallery) return;
        
        if (state.qrCodes.length === 0) {
            gallery.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-qrcode"></i>
                    <p>Нет сохранённых QR-кодов</p>
                    <small>Отсканируйте QR-коды в режиме сканера</small>
                </div>
            `;
            return;
        }
        
        gallery.innerHTML = state.qrCodes.map(qr => `
            <div class="qr-card" data-id="${qr.id}">
                <button class="delete-qr-btn" title="Удалить">
                    <i class="fas fa-times"></i>
                </button>
                <img src="${this.generateQRImage(qr.text)}" alt="QR Code" class="qr-image">
                <div class="qr-text">${this.truncateText(qr.text, 20)}</div>
                <div class="qr-date">${new Date(qr.timestamp).toLocaleDateString('ru-RU')}</div>
            </div>
        `).join('');
        
        // Обработчики для QR-карточек
        gallery.querySelectorAll('.qr-card').forEach(card => {
            const id = card.dataset.id;
            const qr = state.qrCodes.find(q => q.id === id);
            
            card.addEventListener('click', () => {
                this.showQRDetail(qr);
            });
            
            const deleteBtn = card.querySelector('.delete-qr-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                DataManager.deleteQRCode(id);
            });
        });
    }
    
    static generateQRImage(text) {
        // Создаем canvas для генерации QR
        const canvas = document.createElement('canvas');
        canvas.width = 120;
        canvas.height = 120;
        
        const ctx = canvas.getContext('2d');
        
        // Простой QR (в реальном приложении используйте библиотеку)
        ctx.fillStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? '#2d2d2d' : '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? '#ffffff' : '#000000';
        ctx.fillRect(10, 10, 30, 30);
        ctx.fillRect(canvas.width - 40, 10, 30, 30);
        ctx.fillRect(10, canvas.height - 40, 30, 30);
        
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('QR', canvas.width/2, canvas.height/2 + 5);
        
        return canvas.toDataURL();
    }
    
    static truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }
    
    static showQRDetail(qr) {
        const modal = document.getElementById('qrDetailModal');
        if (!modal) return;
        
        document.getElementById('qrDetailText').value = qr.text;
        document.getElementById('qrDetailDate').textContent = new Date(qr.timestamp).toLocaleString('ru-RU');
        document.getElementById('qrDetailSize').textContent = `${qr.text.length} символов`;
        
        // Генерация большого QR
        const preview = document.getElementById('qrDetailPreview');
        preview.innerHTML = '';
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 200;
        
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? '#2d2d2d' : '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? '#ffffff' : '#000000';
        ctx.fillRect(20, 20, 50, 50);
        ctx.fillRect(canvas.width - 70, 20, 50, 50);
        ctx.fillRect(20, canvas.height - 70, 50, 50);
        
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('QR', canvas.width/2, canvas.height/2 + 8);
        
        preview.appendChild(canvas);
        
        // Обработчики кнопок
        document.getElementById('copyQRText').onclick = () => {
            navigator.clipboard.writeText(qr.text);
            UI.showNotification('Текст скопирован', 'success');
        };
        
        document.getElementById('shareQR').onclick = () => {
            if (navigator.share) {
                navigator.share({
                    title: 'QR-код из KBT Utilities',
                    text: qr.text,
                    url: window.location.href
                });
            } else {
                navigator.clipboard.writeText(qr.text);
                UI.showNotification('Текст скопирован в буфер', 'info');
            }
        };
        
        // Закрытие модального окна
        const closeBtn = modal.querySelector('.modal-close');
        closeBtn.onclick = () => modal.classList.remove('show');
        
        modal.classList.add('show');
        
        // Закрытие по клику вне окна
        modal.onclick = (e) => {
            if (e.target === modal) modal.classList.remove('show');
        };
    }
    
    static showNotification(message, type = 'info', duration = 3000) {
        const container = document.getElementById('notificationContainer');
        if (!container) return;
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };
        
        notification.innerHTML = `
            <i class="notification-icon ${icons[type] || icons.info}"></i>
            <div class="notification-content">${message}</div>
            <button class="notification-close">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        container.appendChild(notification);
        
        // Автоудаление
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideInRight 0.3s ease reverse';
                setTimeout(() => notification.remove(), 300);
            }
        }, duration);
        
        // Закрытие по кнопке
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.style.animation = 'slideInRight 0.3s ease reverse';
            setTimeout(() => notification.remove(), 300);
        });
    }
    
    static setupScannerCompatibility() {
        // Проверяем поддержку API камеры
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            Logger.add('Камера не поддерживается браузером', 'error');
            UI.showNotification('Ваш браузер не поддерживает камеру', 'error');
            return false;
        }
        
        // Проверяем доступность библиотеки сканирования
        if (typeof Html5Qrcode === 'undefined') {
            Logger.add('Библиотека сканера не загружена', 'error');
            UI.showNotification('Ошибка загрузки сканера', 'error');
            return false;
        }
        
        return true;
    }
}

// ===== УПРАВЛЕНИЕ СКАНЕРОМ =====
class Scanner {
    static start(mode) {
        if (state.isScanning) return;
        
        const scannerId = mode === 'transfer' ? 'transfer-reader' : 'generic-reader';
        const startBtn = mode === 'transfer' ? 
            document.getElementById('startTransferScan') : 
            document.getElementById('startGenericScan');
        const stopBtn = mode === 'transfer' ? 
            document.getElementById('stopTransferScan') : 
            document.getElementById('stopGenericScan');
        
        // Проверяем совместимость
        if (!UI.setupScannerCompatibility()) {
            UI.showNotification('Сканер недоступен', 'error');
            return;
        }
        
        try {
            // Создаем экземпляр сканера
            state.activeScanner = new Html5Qrcode(scannerId);
            
            const config = {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0
            };
            
            state.activeScanner.start(
                { facingMode: "environment" },
                config,
                (decodedText) => this.onScanSuccess(decodedText, mode),
                (errorMessage) => this.onScanError(errorMessage)
            ).then(() => {
                state.isScanning = true;
                startBtn.disabled = true;
                stopBtn.disabled = false;
                
                Logger.add(`Сканер ${mode} запущен`, 'success');
                UI.showNotification('Сканер запущен', 'success');
                
                // Вибрация (если разрешено и доступно)
                if (state.settings.vibrate && navigator.vibrate) {
                    navigator.vibrate(50);
                }
                
            }).catch(error => {
                Logger.add(`Ошибка запуска сканера ${mode}`, 'error', { error: error.message });
                
                let errorMsg = 'Не удалось запустить камеру';
                if (error.name === 'NotAllowedError') {
                    errorMsg = 'Разрешите доступ к камере в настройках браузера';
                } else if (error.name === 'NotFoundError') {
                    errorMsg = 'Камера не найдена';
                } else if (error.name === 'NotSupportedError') {
                    errorMsg = 'Ваш браузер не поддерживает сканирование';
                }
                
                UI.showNotification(errorMsg, 'error');
                state.activeScanner = null;
            });
            
        } catch (error) {
            Logger.add(`Ошибка создания сканера ${mode}`, 'error', { error: error.message });
            UI.showNotification('Ошибка создания сканера', 'error');
        }
    }
    
    static stop() {
        if (!state.activeScanner || !state.isScanning) return;
        
        state.activeScanner.stop().then(() => {
            state.isScanning = false;
            state.activeScanner = null;
            
            // Обновляем кнопки
            document.getElementById('startTransferScan').disabled = false;
            document.getElementById('stopTransferScan').disabled = true;
            document.getElementById('startGenericScan').disabled = false;
            document.getElementById('stopGenericScan').disabled = true;
            
            Logger.add('Сканер остановлен', 'info');
            UI.showNotification('Сканер остановлен', 'info');
            
        }).catch(error => {
            Logger.add('Ошибка остановки сканера', 'error', { error: error.message });
            state.isScanning = false;
            state.activeScanner = null;
        });
    }
    
    static onScanSuccess(decodedText, mode) {
        Logger.add(`QR отсканирован (${mode})`, 'info', { text: decodedText });
        
        // Звуковой сигнал
        if (state.settings.beep) {
            this.playBeep();
        }
        
        if (mode === 'transfer') {
            this.processTransfer(decodedText);
        } else {
            this.processGenericQR(decodedText);
        }
        
        // Вибрация
        if (state.settings.vibrate && navigator.vibrate) {
            navigator.vibrate([100, 50, 100]);
        }
    }
    
    static onScanError(errorMessage) {
        // Игнорируем обычные ошибки сканирования
        if (!errorMessage.includes('NotFoundException') && 
            !errorMessage.includes('No QR code')) {
            Logger.add('Ошибка сканирования', 'warn', { error: errorMessage });
        }
    }
    
    static processTransfer(text) {
        const pattern = /\$1:1:(\d{10}):/;
        const match = text.match(pattern);
        
        if (!match) {
            UI.showNotification('Неверный формат QR-кода передачи', 'warning');
            Logger.add('Неверный формат передачи', 'warn', { received: text });
            return;
        }
        
        const number = match[1];
        
        // Проверяем дубликаты
        if (state.transferData.some(item => item.number === number)) {
            UI.showNotification(`Номер ${number} уже отсканирован`, 'warning');
            return;
        }
        
        const transfer = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            number: number,
            timestamp: new Date().toISOString(),
            dateDisplay: new Date().toLocaleString('ru-RU')
        };
        
        state.transferData.unshift(transfer);
        UI.saveState();
        UI.renderTransferHistory();
        UI.updateStats();
        
        UI.showNotification(`Добавлено: ${number}`, 'success');
        Logger.add('Передача сохранена', 'success', { number });
        
        // Проверяем автоэкспорт
        if (state.settings.autoExport !== '0' && 
            state.transferData.length % parseInt(state.settings.autoExport) === 0) {
            DataManager.exportCSV();
        }
    }
    
    static processGenericQR(text) {
        // Проверяем дубликаты
        if (state.qrCodes.some(item => item.text === text)) {
            UI.showNotification('Этот QR-код уже сохранён', 'warning');
            return;
        }
        
        const qr = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            text: text,
            timestamp: new Date().toISOString(),
            dateDisplay: new Date().toLocaleString('ru-RU')
        };
        
        state.qrCodes.unshift(qr);
        UI.saveState();
        UI.renderQRCodesGallery();
        UI.updateStats();
        
        UI.showNotification('QR-код сохранён', 'success');
        Logger.add('QR-код сохранён', 'success', { id: qr.id });
    }
    
    static playBeep() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
        } catch (error) {
            // Игнорируем ошибки аудио
        }
    }
}

// ===== УПРАВЛЕНИЕ ДАННЫМИ =====
class DataManager {
    static exportAll() {
        const data = {
            app: 'KBT Utilities',
            version: APP_VERSION,
            exportDate: new Date().toISOString(),
            transfers: state.transferData,
            qrCodes: state.qrCodes,
            settings: state.settings
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { 
            type: 'application/json' 
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kbt_backup_${new Date().toISOString().slice(0, 10)}.json`;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        UI.showNotification('Все данные экспортированы', 'success');
        Logger.add('Экспорт всех данных', 'info');
    }
    
    static exportCSV() {
        if (state.transferData.length === 0) {
            UI.showNotification('Нет данных для экспорта', 'warning');
            return;
        }
        
        let csv = 'ID,Номер передачи,Дата сканирования\n';
        state.transferData.forEach((item, index) => {
            const date = new Date(item.timestamp).toLocaleString('ru-RU');
            csv += `${index + 1},${item.number},"${date}"\n`;
        });
        
        const blob = new Blob(['\ufeff' + csv], { 
            type: 'text/csv;charset=utf-8;' 
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kbt_transfers_${new Date().toISOString().slice(0, 10)}.csv`;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        UI.showNotification(`Экспортировано ${state.transferData.length} записей`, 'success');
        Logger.add('Экспорт CSV', 'info', { count: state.transferData.length });
    }
    
    static clearTransfers() {
        if (state.transferData.length === 0) {
            UI.showNotification('Нет данных для очистки', 'warning');
            return;
        }
        
        if (confirm(`Очистить все передачи (${state.transferData.length} записей)?`)) {
            state.transferData = [];
            UI.saveState();
            UI.renderTransferHistory();
            UI.updateStats();
            
            UI.showNotification('Передачи очищены', 'success');
            Logger.add('Очистка передач', 'warning', { count: state.transferData.length });
        }
    }
    
    static clearQRCodes() {
        if (state.qrCodes.length === 0) {
            UI.showNotification('Нет QR-кодов для очистки', 'warning');
            return;
        }
        
        if (confirm(`Удалить все QR-коды (${state.qrCodes.length} шт.)?`)) {
            state.qrCodes = [];
            UI.saveState();
            UI.renderQRCodesGallery();
            UI.updateStats();
            
            UI.showNotification('QR-коды очищены', 'success');
            Logger.add('Очистка QR-кодов', 'warning', { count: state.qrCodes.length });
        }
    }
    
    static deleteTransfer(id) {
        const item = state.transferData.find(t => t.id === id);
        if (!item) return;
        
        if (confirm(`Удалить передачу ${item.number}?`)) {
            state.transferData = state.transferData.filter(t => t.id !== id);
            UI.saveState();
            UI.renderTransferHistory();
            UI.updateStats();
            
            UI.showNotification('Передача удалена', 'info');
            Logger.add('Удаление передачи', 'info', { number: item.number });
        }
    }
    
    static deleteQRCode(id) {
        const qr = state.qrCodes.find(q => q.id === id);
        if (!qr) return;
        
        if (confirm('Удалить этот QR-код?')) {
            state.qrCodes = state.qrCodes.filter(q => q.id !== id);
            UI.saveState();
            UI.renderQRCodesGallery();
            UI.updateStats();
            
            UI.showNotification('QR-код удалён', 'info');
            Logger.add('Удаление QR-кода', 'info', { id });
        }
    }
    
    static importData(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importedData = JSON.parse(e.target.result);
                
                if (!importedData.transfers || !importedData.qrCodes) {
                    throw new Error('Неверный формат файла');
                }
                
                if (confirm(`Импортировать ${importedData.transfers.length} передач и ${importedData.qrCodes.length} QR-кодов?`)) {
                    // Объединяем данные
                    const existingNumbers = new Set(state.transferData.map(t => t.number));
                    const existingQRTexts = new Set(state.qrCodes.map(q => q.text));
                    
                    importedData.transfers.forEach(transfer => {
                        if (!existingNumbers.has(transfer.number)) {
                            state.transferData.push(transfer);
                        }
                    });
                    
                    importedData.qrCodes.forEach(qr => {
                        if (!existingQRTexts.has(qr.text)) {
                            state.qrCodes.push(qr);
                        }
                    });
                    
                    UI.saveState();
                    UI.renderTransferHistory();
                    UI.renderQRCodesGallery();
                    UI.updateStats();
                    
                    UI.showNotification(`Импортировано: ${importedData.transfers.length} передач, ${importedData.qrCodes.length} QR-кодов`, 'success');
                    Logger.add('Импорт данных', 'info', { 
                        transfers: importedData.transfers.length,
                        qrCodes: importedData.qrCodes.length 
                    });
                }
            } catch (error) {
                Logger.add('Ошибка импорта', 'error', { error: error.message });
                UI.showNotification('Ошибка импорта файла', 'error');
            }
        };
        reader.readAsText(file);
    }
}

// ===== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ =====
document.addEventListener('DOMContentLoaded', () => {
    // Проверяем Service Worker для PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(error => {
            Logger.add('Ошибка регистрации Service Worker', 'error', { error: error.message });
        });
    }
    
    // Инициализируем UI
    UI.init();
    
    // Рендерим начальные данные
    UI.renderTransferHistory();
    UI.renderQRCodesGallery();
    
    // Обновляем статус соединения
    UI.updateConnectionStatus(navigator.onLine);
    
    Logger.add('Приложение KBT Utilities v2.0 запущено', 'success');
});

// ===== ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ HTML =====
window.downloadAppLog = Logger.download;

// Импорт файлов
const importFileInput = document.createElement('input');
importFileInput.type = 'file';
importFileInput.accept = '.json';
importFileInput.style.display = 'none';
importFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        DataManager.importData(e.target.files[0]);
    }
});
document.body.appendChild(importFileInput);

// Экспортируем для отладки
window.state = state;
window.UI = UI;
window.Scanner = Scanner;
window.DataManager = DataManager;
window.Logger = Logger;
