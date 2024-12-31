const Flutterwave = require('flutterwave-node-v3');

export const flwAPI = new Flutterwave(
    process.env.FLUTTERWAVE_PUBK,
    process.env.FLUTTERWAVE_SECK
  );


export const verifyFlutterwaveTxn = async({id, amount, currency}: { id: string, amount: string | number, currency: string}) => {
    try {
        const response = await flwAPI.Transaction.verify({ id });
      if (
        response.data.status === "successful" &&
        response.data.amount === amount &&
        response.data.currency === currency
      ) {
        return true
      }
      return false;
    } catch (error) {
        return false
    }
}