// Обновленный auth.js с динамическим redirect_uri
const GOOGLE_CLIENT_ID = '974542744194-pnlcfgnf40ogsgspdtm8cf5i3opn9ept.apps.googleusercontent.com';
const SPREADSHEET_ID = '1jST0QufgFkGuvvQ-iweX21L_LqC0jr4ii7sdHI5wVPU';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

class GoogleAuth {
    constructor() {
        this.tokenClient = null;
        this.gapiInited = false;
        this.gisInited = false;
        this.isAuthorized = false;
        this.accessToken = null;
        
        // Динамически определяем redirect_uri
        this.redirectUri = this.getRedirectUri();
    }

    getRedirectUri() {
        const currentOrigin = window.location.origin;
        const currentPathname = window.location.pathname;
        
        // Если это локальный сервер
        if (currentOrigin.includes('localhost')) {
            return currentOrigin + '/';
        }
        
        // Если это GitHub Pages
        // Убедитесь, что путь соответствует вашему репозиторию
        // Например: https://blessmesantana.github.io/project/
        return currentOrigin + currentPathname;
    }

    async initialize() {
        try {
            // Загружаем библиотеки
            await this.loadGapi();
            await this.loadGis();
            
            if (this.gapiInited && this.gisInited) {
                this.updateAuthStatus('ready', 'Готов к авторизации');
                this.log(`Используем redirect_uri: ${this.redirectUri}`);
            }
        } catch (error) {
            console.error('Ошибка инициализации:', error);
            this.updateAuthStatus('error', 'Ошибка инициализации');
        }
    }

    loadGapi() {
        return new Promise((resolve) => {
            // Используем только OAuth2 без API Key
            gapi.load('client', async () => {
                try {
                    await gapi.client.init({
                        // НЕ указываем apiKey здесь!
                        discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
                    });
                    this.gapiInited = true;
                    this.log('Google API client загружен');
                    resolve();
                } catch (error) {
                    console.log('Примечание: API Key не требуется для OAuth');
                    this.gapiInited = true;
                    resolve();
                }
            });
        });
    }

    loadGis() {
        return new Promise((resolve) => {
            // Важно: используем правильный redirect_uri
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
                // Добавляем redirect_uri явно
                redirect_uri: this.redirectUri,
                // Для веб-приложений на GitHub Pages
                hint: 'select_account', // Показывать выбор аккаунта
                ux_mode: 'popup', // Используем popup вместо redirect
            });
            
            this.gisInited = true;
            this.log('Google Identity Services загружены');
            this.log(`Redirect URI: ${this.redirectUri}`);
            resolve();
        });
    }

    async authorize() {
        if (!this.gisInited) {
            this.updateAuthStatus('error', 'Google Identity Services не загружены');
            return;
        }

        this.updateAuthStatus('loading', 'Запрос авторизации...');
        this.log(`Начинаем авторизацию с redirect_uri: ${this.redirectUri}`);
        
        try {
            // Указываем дополнительные параметры
            const options = {
                prompt: 'consent', // Всегда запрашивать согласие
            };
            
            this.tokenClient.requestAccessToken(options);
        } catch (error) {
            this.handleAuthError(error);
        }
    }

    handleAuthSuccess(accessToken) {
        this.accessToken = accessToken;
        this.isAuthorized = true;
        
        // Устанавливаем токен для gapi
        gapi.client.setToken({ access_token: accessToken });
        
        this.updateAuthStatus('authorized', 'Авторизован ✓');
        this.log('Успешная авторизация через Google');
        
        // Обновляем UI
        const authButton = document.getElementById('authButton');
        if (authButton) {
            authButton.innerHTML = '<i class="fas fa-check-circle"></i> Авторизован';
            authButton.classList.add('btn-success');
            authButton.classList.remove('btn-google');
            authButton.disabled = false;
        }
        
        // Проверяем доступ к таблице
        this.checkSpreadsheetAccess();
    }

    handleAuthError(error) {
        console.error('Auth error:', error);
        
        let errorMessage = 'Ошибка авторизации';
        let details = '';
        
        if (error === 'popup_closed_by_user') {
            errorMessage = 'Авторизация отменена пользователем';
        } else if (error.includes('access_denied')) {
            errorMessage = 'Доступ запрещен';
            details = 'Проверьте разрешения в Google Cloud Console';
        } else if (error.includes('redirect_uri')) {
            errorMessage = 'Ошибка redirect_uri';
            details = `Проверьте настройки в Google Cloud Console. Текущий URI: ${this.redirectUri}`;
        }
        
        this.updateAuthStatus('error', errorMessage);
        this.log(`Ошибка авторизации: ${errorMessage}. ${details}`);
        
        // Показываем подробное сообщение
        alert(`Ошибка авторизации: ${errorMessage}\n\n${details}\n\nПроверьте настройки в Google Cloud Console:\n1. Authorized redirect URIs\n2. Authorized JavaScript origins\n\nТекущий URI: ${this.redirectUri}`);
    }

    async checkSpreadsheetAccess() {
        try {
            this.updateAuthStatus('loading', 'Проверка доступа к таблице...');
            
            // Простая проверка без сложных запросов
            const response = await gapi.client.sheets.spreadsheets.get({
                spreadsheetId: SPREADSHEET_ID,
                fields: 'properties.title,spreadsheetUrl',
            });
            
            const sheetTitle = response.result.properties.title;
            this.updateAuthStatus('authorized', `Доступ к "${sheetTitle}" разрешен`);
            this.log(`Подключено к таблице: "${sheetTitle}"`);
            
            // Обновляем статус в UI
            const sheetStatus = document.getElementById('sheetStatus');
            if (sheetStatus) {
                sheetStatus.innerHTML = 
                    `<i class="fas fa-check-circle"></i> Таблица "${sheetTitle}" доступна`;
            }
            
        } catch (error) {
            console.error('Spreadsheet access error:', error);
            
            // Показываем дружелюбное сообщение об ошибке
            let errorMsg = 'Нет доступа к таблице';
            if (error.status === 403) {
                errorMsg = 'Доступ запрещен. Добавьте ваш email в редакторы таблицы';
            } else if (error.status === 404) {
                errorMsg = 'Таблица не найдена. Проверьте ID таблицы';
            }
            
            this.updateAuthStatus('error', errorMsg);
            
            const sheetStatus = document.getElementById('sheetStatus');
            if (sheetStatus) {
                sheetStatus.innerHTML = 
                    `<i class="fas fa-exclamation-triangle"></i> ${errorMsg}`;
            }
        }
    }

    // ... остальные методы остаются без изменений ...
}
