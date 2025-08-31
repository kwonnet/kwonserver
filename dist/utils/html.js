"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHtmlText = void 0;
const getHtmlText = (isSuccess, message) => {
    const htmlPage = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Torazone - Transaction Verification</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f4f4f9; display: flex; justify-content: center; align-items: center; height: 100vh; }
            .container { text-align: center; background: #fff; padding: 30px; border-radius: 10px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1); width: 90%; max-width: 400px; }
            .icon { font-size: 50px; margin-bottom: 20px; }
            .success .icon { color: #4CAF50; }
            .failed .icon { color: #F44336; }
            h1 { font-size: 24px; margin-bottom: 10px; }
            p { font-size: 16px; color: #555; margin-bottom: 20px; }
            .button { text-decoration: none; padding: 10px 20px; font-size: 16px; border-radius: 5px; color: #fff; }
            .button.success { background: #4CAF50; }
            .button.failed { background: #F44336; }
        </style>
    </head>
    <body>
        <div class="container ${isSuccess ? 'success' : 'failed'}">
            <div class="icon">${isSuccess ? '✔' : '✖'}</div>
            <h1>${isSuccess ? 'Verification Successful' : 'Verification Failed'}</h1>
            <p>${message}</p>
            <p>Close this page and return to the app</p>
        </div>
    </body>
    </html>
    `;
    return htmlPage;
};
exports.getHtmlText = getHtmlText;
