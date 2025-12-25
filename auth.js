// Конфигурация Google OAuth
const GOOGLE_CLIENT_ID = '974542744194-pnlcfgnf40ogsgspdtm8cf5i3opn9ept.apps.googleusercontent.com'; // Замените на ваш Client ID
const GOOGLE_API_KEY = 'ВАШ_API_KEY'; // Опционально, если используете API Key
const SPREADSHEET_ID = '1jST0QufgFkGuvvQ-iweX21L_LqC0jr4ii7sdHI5wVPU';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

class GoogleAuth {
    constructor() {
        this.tokenClient = null;
        this.gapiInited = false;
        this.gisInited = false;
        this.isAuthorized = false;
        this.accessToken = null;
    }

    async initialize() {
        try {
            // Загружаем Google API Client Library
            await this.loadGapi();
            await this.loadGis();
            
            if (this.gapiInited && this.gisInited) {
                this.updateAuthStatus('ready', 'Готов к авторизации');
            }
        } catch (error) {
            console.error('Ошибка инициализации:', error);
            this.updateAuthStatus('error', 'Ошибка инициализации');
        }
    }

    loadGapi() {
        return new Promise((resolve) => {
            gapi.load('client', async () => {
                try {
                    await gapi.client.init({
                        apiKey: GOOGLE_API_KEY,
                        discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
                    });
                    this.gapiInited = true;
                    this.log('Google API client loaded');
                    resolve();
                } catch (error) {
                    console.error('Error loading GAPI:', error);
                    resolve(); // Продолжаем без API key
                }
            });
        });
    }

    loadGis() {
        return new Promise((resolve) => {
            this.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CLIENT_ID,
                scope: SCOPES,
                callback: (response) => {
                    if (response.error) {
                        this.handleAuthError(response.error);
                    } else {
                        this.handleAuthSuccess(response.access_token);
                    }
                },
            });
            this.gisInited = true;
            this.log('Google Identity Services loaded');
            resolve();
        });
    }

    async authorize() {
        if (!this.gisInited) {
            this.updateAuthStatus('error', 'Google Identity Services не загружены');
            return;
        }

        this.updateAuthStatus('loading', 'Запрос авторизации...');
        
        try {
            // Запрашиваем токен доступа
            if (gapi.client.getToken() === null) {
                this.tokenClient.requestAccessToken({ prompt: 'consent' });
            } else {
                this.tokenClient.requestAccessToken({ prompt: '' });
            }
        } catch (error) {
            this.handleAuthError(error);
        }
    }

    handleAuthSuccess(accessToken) {
        this.accessToken = accessToken;
        this.isAuthorized = true;
        
        // Устанавливаем токен для gapi
        gapi.client.setToken({ access_token: accessToken });
        
        this.updateAuthStatus('authorized', 'Авторизован');
        this.log('Успешная авторизация через Google');
        
        // Обновляем UI
        document.getElementById('authButton').innerHTML = 
            '<i class="fas fa-check-circle"></i> Авторизован';
        document.getElementById('authButton').classList.add('btn-success');
        document.getElementById('authButton').classList.remove('btn-google');
        
        // Проверяем доступ к таблице
        this.checkSpreadsheetAccess();
    }

    handleAuthError(error) {
        console.error('Auth error:', error);
        
        let errorMessage = 'Ошибка авторизации';
        if (error === 'popup_closed_by_user') {
            errorMessage = 'Авторизация отменена пользователем';
        } else if (error.includes('access_denied')) {
            errorMessage = 'Доступ запрещен. Проверьте разрешения';
        }
        
        this.updateAuthStatus('error', errorMessage);
        this.log(`Ошибка авторизации: ${error}`);
    }

    async checkSpreadsheetAccess() {
        try {
            this.updateAuthStatus('loading', 'Проверка доступа к таблице...');
            
            const response = await gapi.client.sheets.spreadsheets.get({
                spreadsheetId: SPREADSHEET_ID,
                fields: 'properties.title',
            });
            
            const sheetTitle = response.result.properties.title;
            this.updateAuthStatus('authorized', `Доступ к "${sheetTitle}" разрешен`);
            this.log(`Подключено к таблице: "${sheetTitle}"`);
            
            // Обновляем статус в UI
            document.getElementById('sheetStatus').innerHTML = 
                `<i class="fas fa-check-circle"></i> Таблица "${sheetTitle}" доступна`;
            
        } catch (error) {
            console.error('Spreadsheet access error:', error);
            this.updateAuthStatus('error', 'Нет доступа к таблице');
            document.getElementById('sheetStatus').innerHTML = 
                `<i class="fas fa-exclamation-triangle"></i> Нет доступа к таблице`;
        }
    }

    async appendToSheet(number) {
        if (!this.isAuthorized || !this.accessToken) {
            throw new Error('Не авторизован. Сначала войдите с Google');
        }

        try {
            // Находим первую пустую строку в столбце A
            const rangeResponse = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: 'A:A',
            });
            
            const values = rangeResponse.result.values || [];
            let nextRow = 2; // Начинаем с A2
            
            if (values.length > 0) {
                // Ищем первую пустую ячейку после A1
                for (let i = 1; i < values.length; i++) {
                    if (!values[i] || values[i][0] === '') {
                        nextRow = i + 1;
                        break;
                    }
                }
                if (nextRow === 2 && values.length > 1) {
                    nextRow = values.length + 1;
                }
            }
            
            // Записываем данные
            const updateResponse = await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `A${nextRow}`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [[number]]
                },
            });
            
            this.log(`Данные записаны в строку ${nextRow}: ${number}`);
            return { success: true, row: nextRow };
            
        } catch (error) {
            console.error('Ошибка записи в таблицу:', error);
            throw new Error(`Не удалось записать в таблицу: ${error.message}`);
        }
    }

    updateAuthStatus(status, message) {
        const authStatus = document.getElementById('authStatus');
        const icon = authStatus.querySelector('i');
        
        // Удаляем все классы статуса
        authStatus.className = 'auth-status';
        
        switch (status) {
            case 'ready':
                authStatus.classList.add('ready');
                icon.className = 'fas fa-circle-check';
                break;
            case 'loading':
                authStatus.classList.add('loading');
                icon.className = 'fas fa-circle-notch fa-spin';
                break;
            case 'authorized':
                authStatus.classList.add('authorized');
                icon.className = 'fas fa-check-circle';
                break;
            case 'error':
                authStatus.classList.add('error');
                icon.className = 'fas fa-exclamation-circle';
                break;
        }
        
        authStatus.querySelector('span').textContent = message;
    }

    log(message) {
        const time = new Date().toLocaleTimeString('ru-RU', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        logEntry.innerHTML = `
            <span class="log-time">${time}</span>
            <span class="log-text">${message}</span>
        `;
        
        const logContent = document.getElementById('logContent');
        logContent.appendChild(logEntry);
        logContent.scrollTop = logContent.scrollHeight;
    }
}

// Глобальный экземпляр
const googleAuth = new GoogleAuth();

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    googleAuth.initialize();
    
    // Кнопка авторизации
    document.getElementById('authButton').addEventListener('click', () => {
        googleAuth.authorize();
    });
});