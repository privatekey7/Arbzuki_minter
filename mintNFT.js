const { Web3 } = require('web3');
const { Transaction } = require('@ethereumjs/tx');
const { Chain, Common } = require('@ethereumjs/common');
const fs = require('fs');
const readline = require('readline');

// Цвета для консоли
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m'
};

// Функции логирования
function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const types = {
        success: `${colors.green}✓${colors.reset}`,
        warning: `${colors.yellow}!${colors.reset}`,
        error: `${colors.red}✗${colors.reset}`,
        info: `${colors.green}ℹ${colors.reset}`
    };
    
    const coloredMessage = type === 'success' ? `${colors.green}${message}${colors.reset}` :
                          type === 'warning' ? `${colors.yellow}${message}${colors.reset}` :
                          type === 'error' ? `${colors.red}${message}${colors.reset}` :
                          `${colors.green}${message}${colors.reset}`;

    console.log(`[${timestamp}] ${types[type]} ${coloredMessage}`);
}

// Конфигурация для минта Arbzukiswap NFT
const RPC_URL = 'https://arbitrum-one.blastapi.io/0e189c72-1523-48e1-8727-7dd520f19c1f';
const NFT_CONTRACT_ADDRESS = '0x00005EA00Ac477B1030CE78506496e8C2DE24bf5'; // Контракт Arbzukiswap NFT
const NFT_CHECK_CONTRACT = '0x071126cbec1c5562530ab85fd80dd3e3a42a70b8'; // Контракт для проверки баланса
const EXPLORER_URL = 'https://arbiscan.io/tx/';
const DEFAULT_GAS_LIMIT = 400000; // Увеличенный газлимит
const FEE_RECIPIENT = '0x0000a26b00c1f0df003000390027140000faa719';
const MINTER_IF_NOT_PAYER = '0x0000000000000000000000000000000000000000';

// Создаем интерфейс для чтения пользовательского ввода
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Функция для получения случайного числа в диапазоне
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Функция для запроса диапазона задержки
function askDelayRange() {
    return new Promise((resolve) => {
        rl.question('Введите минимальное время задержки (в минутах): ', (minDelay) => {
            rl.question('Введите максимальное время задержки (в минутах): ', (maxDelay) => {
                const min = parseInt(minDelay);
                const max = parseInt(maxDelay);
                if (isNaN(min) || isNaN(max) || min < 0 || max < min) {
                    log('Некорректный ввод. Используем значения по умолчанию: 1-5 минут', 'warning');
                    resolve({ min: 1, max: 5 });
                } else {
                    resolve({ min, max });
                }
            });
        });
    });
}

// Вспомогательная функция для форматирования hex
function toHex(number) {
    const hex = BigInt(number).toString(16);
    return '0x' + hex;
}

// Читаем приватные ключи из файла
const PRIVATE_KEYS = fs.readFileSync('keys.txt', 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && line !== 'ВСТАВЬТЕ_ВАШ_ПРИВАТНЫЙ_КЛЮЧ');

if (PRIVATE_KEYS.length === 0) {
    log('Пожалуйста, добавьте приватные ключи в файл keys.txt (по одному на строку)', 'error');
    process.exit(1);
}

log(`Загружено ${PRIVATE_KEYS.length} приватных ключей`, 'info');

// ABI для функций
const MINT_ABI = [{
    "inputs": [
        {"internalType": "address", "name": "nftContract", "type": "address"},
        {"internalType": "address", "name": "feeRecipient", "type": "address"},
        {"internalType": "address", "name": "minterIfNotPayer", "type": "address"},
        {"internalType": "uint256", "name": "quantity", "type": "uint256"}
    ],
    "name": "mintPublic",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
}];

const NFT_CHECK_ABI = [{
    "inputs": [{"internalType": "address", "name": "owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
}];

// Функция проверки формата ключа
function validateAndFormatKey(key) {
    // Удаляем пробелы и переносы строк
    key = key.replace(/\s+/g, '').toLowerCase();

    // Добавляем префикс 0x если его нет
    if (!key.startsWith('0x')) {
        key = '0x' + key;
    }

    // Проверяем формат ключа
    if (!/^0x[0-9a-f]{64}$/.test(key)) {
        return null;
    }

    return key;
}

// Инициализация Web3
const web3 = new Web3(new Web3.providers.HttpProvider(RPC_URL));
const mintContract = new web3.eth.Contract(MINT_ABI, NFT_CONTRACT_ADDRESS);
const nftCheckContract = new web3.eth.Contract(NFT_CHECK_ABI, NFT_CHECK_CONTRACT);

// Функция для паузы между минтами
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function processWallet(privateKey) {
    // Проверяем и форматируем ключ
    const formattedKey = validateAndFormatKey(privateKey);
    if (!formattedKey) {
        log('Пропускаем некорректный ключ...', 'warning');
        return false;
    }

    // Получаем адрес кошелька
    const account = web3.eth.accounts.privateKeyToAccount(formattedKey);
    const walletAddress = account.address;
    log(`\nОбработка кошелька: ${walletAddress}`, 'info');

    try {
        // Проверяем баланс NFT
        const nftBalance = await nftCheckContract.methods.balanceOf(walletAddress).call();
        
        if (parseInt(nftBalance) > 0) {
            log(`На кошельке уже есть ${nftBalance} NFT, минт не требуется`, 'warning');
            return false;
        }

        // Проверяем баланс ETH
        const balance = await web3.eth.getBalance(walletAddress);
        const balanceInEth = web3.utils.fromWei(balance, 'ether');

        if (parseFloat(balanceInEth) > 0) {
            // Подготавливаем транзакцию
            const nonce = await web3.eth.getTransactionCount(walletAddress);
            const gasPrice = '0xc65d40';
            const methodId = '0x161ac21f';
            const params = [
                NFT_CHECK_CONTRACT.slice(2).toLowerCase().padStart(64, '0'),
                FEE_RECIPIENT.slice(2).toLowerCase().padStart(64, '0'),
                MINTER_IF_NOT_PAYER.slice(2).toLowerCase().padStart(64, '0'),
                '0000000000000000000000000000000000000000000000000000000000000001'
            ];
            const txData = methodId + params.join('');
            const gasLimit = 353072;

            const txObject = {
                nonce: toHex(nonce),
                gasPrice: gasPrice,
                gas: toHex(gasLimit),
                to: NFT_CONTRACT_ADDRESS,
                value: '0x0',
                data: txData,
                chainId: 42161
            };

            const signedTx = await web3.eth.accounts.signTransaction(txObject, formattedKey);
            const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
            
            log('Минт успешно выполнен!', 'success');
            log(`Ссылка на транзакцию: ${EXPLORER_URL}${receipt.transactionHash}`, 'success');
            return true;
        } else {
            log('Недостаточно ETH на балансе', 'error');
            return false;
        }
    } catch (error) {
        log(`Ошибка: ${error.message}`, 'error');
        return true; // Возвращаем true при ошибке, чтобы сделать паузу перед следующей попыткой
    }
}

async function checkBalanceAndMint() {
    // Получаем диапазон задержки от пользователя
    const delayRange = await askDelayRange();
    log(`Установлен диапазон задержки: ${delayRange.min}-${delayRange.max} минут`, 'info');
    
    // Обрабатываем каждый кошелек
    for (let i = 0; i < PRIVATE_KEYS.length; i++) {
        const needDelay = await processWallet(PRIVATE_KEYS[i]);
        
        // Делаем паузу только если была попытка минта или произошла ошибка
        if (needDelay && i < PRIVATE_KEYS.length - 1) {
            const delayMinutes = getRandomInt(delayRange.min, delayRange.max);
            const delayMs = delayMinutes * 60 * 1000;
            log(`\nОжидание ${delayMinutes} минут перед следующим кошельком...`, 'info');
            await sleep(delayMs);
        }
    }
    
    rl.close();
    log('\nОбработка всех кошельков завершена', 'success');
}

// Запускаем скрипт
console.log('\n=== Arbzukiswap NFT Minter ===\n');
checkBalanceAndMint(); 