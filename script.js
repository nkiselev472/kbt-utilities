// ===== КОНСТАНТЫ И ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====
const APP_VERSION = '2.1';
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
    sortOrder: 'desc',
    lastNotificationTime: 0,
    ignoreErrors: true
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
        
        // Обновляем UI если нужно (только для критических ошибок)
        if (type === 'error' || type === 'warn') {
            if (!state.ignoreErrors || !message.includes('сканирования')) {
                UI.showNotification(message, type);
            }
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
        
        // Кнопки сканера ШК
        document.getElementById('startGenericScan').addEventListener('click', () => Scanner.start('generic'));
        document.getElementById('stopGenericScan').addEventListener('click', () => Scanner.stop());
        
        // Тема
        document.getElementById('themeToggle').addEventListener('click', this.toggleTheme);
        
        // Меню
        document.getElementById('menuToggle').addEventListener('click', this.toggleMenu);
        
        // Экспорт/Импорт
        document.getElementById('exportAllBtn').addEventListener('click', DataManager.exportAll);
        document.getElementById('exportBtn').addEventListener('click', DataManager.exportCSV);
        document.getElementById('downloadLogBtn').addEventListener('click', Logger.download);
        
        // Очистка
        document.getElementById('clearTransfersBtn').addEventListener('click', DataManager.clearTransfers);
        document.getElementById('clearQRCodesBtn').addEventListener('click', DataManager.clearQRCodes);
        
        // Сортировка
        document.getElementById('sortByDate')?.addEventListener('click', () => {
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
        Logger.add(`Режим изменен: ${mode === 'transfer' ? 'Сканер передач' : 'Сканер ШК'}`, 'info');
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
        
        const statsCount = document.getElementById('statsCount');
        const transfersCountEl = document.getElementById('transfersCount');
        const qrCodesCount = document.getElementById('qrCodesCount');
        
        if (statsCount) statsCount.textContent = `${transfersCount}/${qrCount}`;
        if (transfersCountEl) transfersCountEl.textContent = `Всего: ${transfersCount}`;
        if (qrCodesCount) qrCodesCount.textContent = `${qrCount} ШК`;
        
        if (transfersCount > 0) {
            const lastTransfer = state.transferData[0];
            const lastDate = new Date(lastTransfer.timestamp);
            const lastScanTime = document.getElementById('lastScanTime');
            if (lastScanTime) {
                lastScanTime.textContent = 
                    `Последнее: ${lastDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
            }
        }
    }
    
    static checkStorage() {
        try {
            const total = JSON.stringify(state).length;
            const usedKB = Math.round(total / 1024);
            const limitKB = 5 * 1024; // 5MB лимит
            
            const storageInfo = document.getElementById('storageInfo');
            if (storageInfo) {
                storageInfo.innerHTML = 
                    `<i class="fas fa-hdd"></i> <span>Память: ${usedKB}KB / ${limitKB}KB</span>`;
            }
            
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
                    <i class="fas fa-barcode"></i>
                    <p>Нет сохранённых ШК</p>
                    <small>Отсканируйте ШК в режиме сканера</small>
                </div>
            `;
            return;
        }
        
        gallery.innerHTML = state.qrCodes.map(qr => `
            <div class="qr-card" data-id="${qr.id}">
                <button class="delete-qr-btn" title="Удалить">
                    <i class="fas fa-times"></i>
                </button>
                <div class="qr-image">
                    <canvas class="qr-canvas" width="120" height="120"></canvas>
                </div>
                <div class="qr-text">${this.truncateText(qr.text, 20)}</div>
                <div class="qr-date">${new Date(qr.timestamp).toLocaleDateString('ru-RU')}</div>
            </div>
        `).join('');
        
        // Генерируем штрих-коды для каждого ШК
        gallery.querySelectorAll('.qr-card').forEach((card, index) => {
            const id = card.dataset.id;
            const qr = state.qrCodes.find(q => q.id === id);
            const canvas = card.querySelector('.qr-canvas');
            
            if (canvas && qr) {
                this.generateBarcode(canvas, qr.text);
            }
            
            // Обработчики для карточек
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
    
    static generateBarcode(canvas, text) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Очищаем canvas
        ctx.clearRect(0, 0, width, height);
        
        // Белый фон
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        
        // Чёрные полосы для штрих-кода
        ctx.fillStyle = 'black';
        
        // Генерируем простой штрих-код на основе текста
        const hash = this.hashString(text);
        const barCount = 30;
        const barWidth = width / barCount;
        
        for (let i = 0; i < barCount; i++) {
            // Используем хэш для определения высоты полосы
            const barHeight = (hash[i % hash.length] % 70) + 30;
            const shouldDraw = hash[i % hash.length] % 2 === 0;
            
            if (shouldDraw) {
                const x = i * barWidth;
                ctx.fillRect(x, (height - barHeight) / 2, barWidth - 1, barHeight);
            }
        }
        
        // Добавляем текст под штрих-кодом
        ctx.fillStyle = 'black';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(text.substring(0, 12), width / 2, height - 5);
    }
    
    static hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString().split('').map(Number);
    }
    
    static truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }
    
    static showQRDetail(qr) {
        const modal = document.getElementById('qrDetailModal');
        if (!modal) return;
        
        // Заполняем данные
        document.getElementById('qrDetailText').value = qr.text;
        document.getElementById('qrDetailDate').textContent = new Date(qr.timestamp).toLocaleString('ru-RU');
        document.getElementById('qrDetailSize').textContent = `${qr.text.length} символов`;
        
        // Генерируем большой штрих-код
        const preview = document.getElementById('qrDetailPreview');
        if (preview) {
            preview.innerHTML = '';
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 200;
            
            this.generateBarcode(canvas, qr.text);
            preview.appendChild(canvas);
        }
        
        // Обработчики кнопок
        document.getElementById('copyQRText').onclick = () => {
            navigator.clipboard.writeText(qr.text);
            UI.showNotification('Текст скопирован', 'success');
        };
        
        document.getElementById('shareQR').onclick = () => {
            if (navigator.share) {
                navigator.share({
                    title: 'ШК из KBT Utilities',
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
        // Ограничиваем частоту уведомлений
        const now = Date.now();
        if (now - state.lastNotificationTime < 2000 && type !== 'error') {
            return;
        }
        state.lastNotificationTime = now;
        
        let container = document.getElementById('notificationContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notificationContainer';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-width: 350px;
            `;
            document.body.appendChild(container);
        }
        
        // Ограничиваем количество уведомлений
        if (container.children.length >= 3) {
            container.firstChild?.remove();
        }
        
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
        const autoRemove = setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideInRight 0.3s ease reverse';
                setTimeout(() => notification.remove(), 300);
            }
        }, duration);
        
        // Закрытие по кнопке
        notification.querySelector('.notification-close').addEventListener('click', () => {
            clearTimeout(autoRemove);
            notification.style.animation = 'slideInRight 0.3s ease reverse';
            setTimeout(() => notification.remove(), 300);
        });
    }
    
    static setupScannerCompatibility() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            Logger.add('Камера не поддерживается браузером', 'error');
            UI.showNotification('Ваш браузер не поддерживает камеру', 'error');
            return false;
        }
        
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
        
        if (!UI.setupScannerCompatibility()) {
            UI.showNotification('Сканер недоступен', 'error');
            return;
        }
        
        try {
            state.activeScanner = new Html5Qrcode(scannerId);
            
            const config = {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0
            };
            
            // Временно игнорируем ошибки при запуске
            state.ignoreErrors = true;
            
            state.activeScanner.start(
                { facingMode: "environment" },
                config,
                (decodedText) => this.onScanSuccess(decodedText, mode),
                (errorMessage) => this.onScanError(errorMessage)
            ).then(() => {
                state.isScanning = true;
                if (startBtn) startBtn.disabled = true;
                if (stopBtn) stopBtn.disabled = false;
                
                // Через 2 секунды выключаем игнорирование ошибок
                setTimeout(() => {
                    state.ignoreErrors = false;
                }, 2000);
                
                Logger.add(`Сканер ${mode} запущен`, 'success');
                UI.showNotification('Сканер запущен', 'success');
                
                if (state.settings.vibrate && navigator.vibrate) {
                    navigator.vibrate(50);
                }
                
            }).catch(error => {
                state.ignoreErrors = false;
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
            state.ignoreErrors = false;
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
            const startTransferBtn = document.getElementById('startTransferScan');
            const stopTransferBtn = document.getElementById('stopTransferScan');
            const startGenericBtn = document.getElementById('startGenericScan');
            const stopGenericBtn = document.getElementById('stopGenericScan');
            
            if (startTransferBtn) startTransferBtn.disabled = false;
            if (stopTransferBtn) stopTransferBtn.disabled = true;
            if (startGenericBtn) startGenericBtn.disabled = false;
            if (stopGenericBtn) stopGenericBtn.disabled = true;
            
            Logger.add('Сканер остановлен', 'info');
            UI.showNotification('Сканер остановлен', 'info');
            
        }).catch(error => {
            Logger.add('Ошибка остановки сканера', 'error', { error: error.message });
            state.isScanning = false;
            state.activeScanner = null;
        });
    }
    
    static onScanSuccess(decodedText, mode) {
        Logger.add(`Отсканировано (${mode})`, 'info', { text: decodedText });
        
        // Звуковой сигнал
        if (state.settings.beep) {
            this.playBeep();
        }
        
        if (mode === 'transfer') {
            this.processTransfer(decodedText);
        } else {
            this.processShk(decodedText);
        }
        
        // Вибрация
        if (state.settings.vibrate && navigator.vibrate) {
            navigator.vibrate([100, 50, 100]);
        }
    }
    
    static onScanError(errorMessage) {
        // Игнорируем нормальные ошибки сканирования
        const isNormalError = 
            errorMessage.includes('NotFoundException') || 
            errorMessage.includes('No QR code') ||
            errorMessage.includes('QR code parse error') ||
            errorMessage.includes('Aiming rectangle');
        
        if (!isNormalError && !state.ignoreErrors) {
            Logger.add('Ошибка сканирования', 'warn', { error: errorMessage });
        } else if (!state.ignoreErrors) {
            console.debug('Сканирование: код не найден');
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
    
    static processShk(text) {
        // Проверяем что ШК начинается с *
        if (!text.startsWith('*')) {
            UI.showNotification('Неверный формат ШК. Должен начинаться с *', 'warning');
            Logger.add('Неверный формат ШК', 'warn', { received: text });
            return;
        }
        
        // Проверяем дубликаты
        if (state.qrCodes.some(item => item.text === text)) {
            UI.showNotification('Этот ШК уже сохранён', 'warning');
            return;
        }
        
        const shk = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            text: text,
            timestamp: new Date().toISOString(),
            dateDisplay: new Date().toLocaleString('ru-RU')
        };
        
        state.qrCodes.unshift(shk);
        UI.saveState();
        UI.renderQRCodesGallery();
        UI.updateStats();
        
        UI.showNotification('ШК сохранён', 'success');
        Logger.add('ШК сохранён', 'success', { id: shk.id });
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
            UI.showNotification('Нет ШК для очистки', 'warning');
            return;
        }
        
        if (confirm(`Удалить все ШК (${state.qrCodes.length} шт.)?`)) {
            state.qrCodes = [];
            UI.saveState();
            UI.renderQRCodesGallery();
            UI.updateStats();
            
            UI.showNotification('ШК очищены', 'success');
            Logger.add('Очистка ШК', 'warning', { count: state.qrCodes.length });
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
        
        if (confirm('Удалить этот ШК?')) {
            state.qrCodes = state.qrCodes.filter(q => q.id !== id);
            UI.saveState();
            UI.renderQRCodesGallery();
            UI.updateStats();
            
            UI.showNotification('ШК удалён', 'info');
            Logger.add('Удаление ШК', 'info', { id });
        }
    }
}

// ===== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ =====
document.addEventListener('DOMContentLoaded', () => {
    // Инициализируем UI
    UI.init();
    
    // Рендерим начальные данные
    UI.renderTransferHistory();
    UI.renderQRCodesGallery();
    
    // Обновляем статус соединения
    UI.updateConnectionStatus(navigator.onLine);
    
    Logger.add(`Приложение KBT Utilities ${APP_VERSION} запущено`, 'success');
});

// ===== ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ HTML =====
window.downloadAppLog = Logger.download;

// Экспортируем для отладки
window.state = state;
window.UI = UI;
window.Scanner = Scanner;
window.DataManager = DataManager;
window.Logger = Logger;
