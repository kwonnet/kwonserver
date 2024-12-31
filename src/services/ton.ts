import { telegramBotUrl, tonAPIEndpoint, tonWalletMnemonic } from "@/config";
import {
  TonClient,
  WalletContractV4,
  WalletContractV5R1,
  internal,
  fromNano,
  SendMode,
} from "@ton/ton";
import {
  mnemonicToPrivateKey,
  mnemonicToWalletKey,
} from "@ton/crypto";
import { getHttpEndpoint } from "@orbs-network/ton-access";
import { sleep } from "@/utils";

export async function withdrawTestTonCoins(
  recipientAddress: string,
  amount: number,
  message?: string
) {
  try {
    console.log("Withdrawal starting...")
    // get the decentralized RPC endpoint
    const endpoint = await getHttpEndpoint({ network: "testnet" });
    // Create Client
    const client = new TonClient({ endpoint });
    // Generate new key
    // const mnemonics =
    //   "cheese,pig,bicycle,reform,enforce,flock,exile,defy,remove,soup,mule,smooth,mango,stand,donor,act,account,relief,kit,dinner,submit,alone,multiply,notable".split(
    //     ","
    //   );
    const mnemonics = tonWalletMnemonic.split(",");
    // let mnemonics = await mnemonicNew();
    let keyPair = await mnemonicToWalletKey(mnemonics);
    // Create wallet contract
    let wallet = WalletContractV5R1.create({
      workchain: 0,
      publicKey: keyPair.publicKey,
    });
    // create contract
    const walletContract = client.open(wallet);
    // Get balance
    const balance = await walletContract.getBalance();
    const walletBalance = Number(fromNano(balance));
    console.log("walletBalance ", walletBalance)
    if(walletBalance < amount) {
      console.log("Insufficient balance")
      return { isError: true, message: "App's Ton wallet balance is too low"}
    }
    // Get Seq number
    const seqno: number = await walletContract.getSeqno();
    // send transfer
    await walletContract.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      messages: [
        internal({
          value: amount.toString(),
          to: recipientAddress,
          body: message,
          bounce: false,
        }),
      ],
    });
    console.log("Withdrawal complete")
    return { message: "Withdrawal successful", isError: false };
  } catch (error: any) {
    console.log("Withdrawal Error: ", error?.message);
    return { message: error?.status === 504 ? "Network congested, please try again": error?.message, isError: true };
  }
}
export async function withdrawTonCoins(
  recipientAddress: string,
  amount: number,
  message?: string
) {
  try {
    // get the decentralized RPC endpoint
    const endpoint = await getHttpEndpoint();
    // Connect to TON mainnet
    const client = new TonClient({ endpoint });
    // Sender wallet details (mnemonic or private key)
    const mnemonic = tonWalletMnemonic.split(",");
    // get keyPair
    const keyPair = await mnemonicToWalletKey(mnemonic);
    // Define sender wallet address
    const wallet = WalletContractV5R1.create({
      publicKey: keyPair.publicKey,
      workchain: 0, // Typically 0 for mainnet
    });
    // open wallet's current state
    const walletContract = client.open(wallet);
    // Get balance
    const balance = await walletContract.getBalance();
    const walletBalance = Number(fromNano(balance));
    if(walletBalance < amount) return { isError: true, message: "App's Ton wallet balance is too low"}
    // get sequence number
    let seqno: number = await walletContract.getSeqno();
    // send transfer
    await walletContract.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      messages: [
        internal({
          value: amount.toString(),
          to: recipientAddress,
          body: message,
          bounce: false,
        }),
      ],
    });
    
    return { message: "Withdrawal successful", isError: false };
  } catch (error: any) {
    return { message: error?.status === 504 ? "Network congested, please try again": error?.message, isError: true };
  }
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
