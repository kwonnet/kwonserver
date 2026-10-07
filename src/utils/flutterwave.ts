import axios from 'axios';

const client = axios.create({baseURL: 'https://api.flutterwave.com/v3', timeout: 15000, maxRedirects: 0});
interface VerifiedTransaction {
  id: string | number; tx_ref: string | number; status: string; amount: number;
  currency: string; meta: Record<string, any>; [key: string]: any;
}
// Keep the service contract while using the documented, read-only REST endpoint.
export const flwAPI = {Transaction: {async verify({id}: {id: string | number}): Promise<{status: string; data: VerifiedTransaction}> {
  const transactionId = String(id);
  if (!/^[1-9]\d*$/.test(transactionId)) throw new Error('Invalid Flutterwave transaction ID');
  const key = process.env.FLUTTERWAVE_SECK;
  if (!key) throw new Error('Flutterwave is not configured');
  const response = await client.get(`/transactions/${transactionId}/verify`, {headers: {Authorization: `Bearer ${key}`}});
  if (response.data?.status !== 'success' || !response.data?.data) throw new Error('Flutterwave verification failed');
  return response.data;
}}};

export const verifyFlutterwaveTxn = async ({id, amount, currency}: {id: string; amount: string | number; currency: string}) => {
  try {
    const response = await flwAPI.Transaction.verify({id});
    return response.data.status === 'successful' && response.data.amount === amount && response.data.currency === currency;
  } catch {return false;}
};
