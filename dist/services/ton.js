"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawTestTonCoins = withdrawTestTonCoins;
exports.withdrawTonCoins = withdrawTonCoins;
const config_1 = require("@/config");
const ton_1 = require("@ton/ton");
const crypto_1 = require("@ton/crypto");
const ton_access_1 = require("@orbs-network/ton-access");
function withdrawTestTonCoins(recipientAddress, amount, message) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log("Withdrawal starting...");
            // get the decentralized RPC endpoint
            const endpoint = yield (0, ton_access_1.getHttpEndpoint)({ network: "testnet" });
            // Create Client
            const client = new ton_1.TonClient({ endpoint });
            // Generate new key
            // const mnemonics =
            //   "cheese,pig,bicycle,reform,enforce,flock,exile,defy,remove,soup,mule,smooth,mango,stand,donor,act,account,relief,kit,dinner,submit,alone,multiply,notable".split(
            //     ","
            //   );
            const mnemonics = config_1.tonWalletMnemonic.split(",");
            // let mnemonics = await mnemonicNew();
            let keyPair = yield (0, crypto_1.mnemonicToWalletKey)(mnemonics);
            // Create wallet contract
            let wallet = ton_1.WalletContractV5R1.create({
                workchain: 0,
                publicKey: keyPair.publicKey,
            });
            // create contract
            const walletContract = client.open(wallet);
            // Get balance
            const balance = yield walletContract.getBalance();
            const walletBalance = Number((0, ton_1.fromNano)(balance));
            console.log("walletBalance ", walletBalance);
            if (walletBalance < amount) {
                console.log("Insufficient balance");
                return { isError: true, message: "App's Ton wallet balance is too low" };
            }
            // Get Seq number
            const seqno = yield walletContract.getSeqno();
            // send transfer
            yield walletContract.sendTransfer({
                seqno,
                secretKey: keyPair.secretKey,
                sendMode: ton_1.SendMode.PAY_GAS_SEPARATELY,
                messages: [
                    (0, ton_1.internal)({
                        value: amount.toString(),
                        to: recipientAddress,
                        body: message,
                        bounce: false,
                    }),
                ],
            });
            console.log("Withdrawal complete");
            return { message: "Withdrawal successful", isError: false };
        }
        catch (error) {
            console.log("Withdrawal Error: ", error === null || error === void 0 ? void 0 : error.message);
            return { message: (error === null || error === void 0 ? void 0 : error.status) === 504 ? "Network congested, please try again" : error === null || error === void 0 ? void 0 : error.message, isError: true };
        }
    });
}
function withdrawTonCoins(recipientAddress, amount, message) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // get the decentralized RPC endpoint
            const endpoint = yield (0, ton_access_1.getHttpEndpoint)();
            // Connect to TON mainnet
            const client = new ton_1.TonClient({ endpoint });
            // Sender wallet details (mnemonic or private key)
            const mnemonic = config_1.tonWalletMnemonic.split(",");
            // get keyPair
            const keyPair = yield (0, crypto_1.mnemonicToWalletKey)(mnemonic);
            // Define sender wallet address
            const wallet = ton_1.WalletContractV5R1.create({
                publicKey: keyPair.publicKey,
                workchain: 0, // Typically 0 for mainnet
            });
            // open wallet's current state
            const walletContract = client.open(wallet);
            // Get balance
            const balance = yield walletContract.getBalance();
            const walletBalance = Number((0, ton_1.fromNano)(balance));
            if (walletBalance < amount)
                return { isError: true, message: "App's Ton wallet balance is too low" };
            // get sequence number
            let seqno = yield walletContract.getSeqno();
            // send transfer
            yield walletContract.sendTransfer({
                seqno,
                secretKey: keyPair.secretKey,
                sendMode: ton_1.SendMode.PAY_GAS_SEPARATELY,
                messages: [
                    (0, ton_1.internal)({
                        value: amount.toString(),
                        to: recipientAddress,
                        body: message,
                        bounce: false,
                    }),
                ],
            });
            return { message: "Withdrawal successful", isError: false };
        }
        catch (error) {
            return { message: (error === null || error === void 0 ? void 0 : error.status) === 504 ? "Network congested, please try again" : error === null || error === void 0 ? void 0 : error.message, isError: true };
        }
    });
}
// create the transfer
// const transfer = wallet.createTransfer({
//     seqno,
//     secretKey: keyPair.secretKey,
//     messages: [internal({
//         value: amount.toString(),
//         to: recipientAddress,
//         body: message,
//         bounce: false
//       })],
// });
// contract.send(transfer)
