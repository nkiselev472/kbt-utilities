// simple-auth.js - Простая версия без OAuth
const API_KEY = 'AIzaSyCnBAt3KsiXRbkd9z02yJJsIHkFjL_u5qg';
const SPREADSHEET_ID = '1jST0QufgFkGuvvQ-iweX21L_LqC0jr4ii7sdHI5wVPU';

class SimpleGoogleSheets {
    constructor() {
        this.initialized = false;
    }

    async initialize() {
        if (!this.initialized) {
            await this.loadGapi();
            this.initialized = true;
        }
    }

    loadGapi() {
        return new Promise((resolve, reject) => {
            gapi.load('client', () => {
                gapi.client.init({
                    apiKey: API_KEY,
                    discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
                }).then(() => {
                    resolve();
                }).catch(reject);
            });
        });
    }

    async appendData(number) {
        try {
            // Получаем последнюю строку
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: 'A:A',
            });

            const values = response.result.values || [];
            const nextRow = values.length + 1;

            // Добавляем данные
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `A${nextRow}`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [[number]]
                },
            });

            return { success: true, row: nextRow };
        } catch (error) {
            console.error('Ошибка:', error);
            throw error;
        }
    }
}
