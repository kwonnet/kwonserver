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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncFlwSubscriptionPlans = exports.verifyFlutterwavePayment = exports.generateFlutterwavePaymentLink = void 0;
const config_1 = require("@/config");
const db_1 = __importDefault(require("@/db"));
const _types_1 = require("@/@types");
const flutterwave_1 = require("@/utils/flutterwave");
const client_1 = require("@prisma/client");
const axios_1 = __importDefault(require("axios"));
const flwAxiosAPI = axios_1.default.create({
    baseURL: "https://api.flutterwave.com/v3",
    headers: {
        Authorization: `Bearer ${process.env.FLUTTERWAVE_SECK}`,
    },
});
const generateFlutterwavePaymentLink = (config) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    try {
        const response = yield axios_1.default.post(config_1.flutterwaveApiUrl, config, {
            headers: {
                Authorization: `Bearer ${config_1.flutterwaveSecretKey}`,
                "Content-Type": "application/json",
            },
        });
        return { data: response.data.data.link, status: 200 };
    }
    catch (error) {
        const status = (_a = error === null || error === void 0 ? void 0 : error.status) !== null && _a !== void 0 ? _a : 500;
        let message = error === null || error === void 0 ? void 0 : error.message;
        if ((_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.data) {
            message = (_e = (_d = (_c = error === null || error === void 0 ? void 0 : error.response) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.message) !== null && _e !== void 0 ? _e : message;
        }
        return { status, data: message };
    }
});
exports.generateFlutterwavePaymentLink = generateFlutterwavePaymentLink;
const coinsResponse = (txnData) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
    const obj = {
        id: String((_a = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _a === void 0 ? void 0 : _a.id),
        amount: Number((_b = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _b === void 0 ? void 0 : _b.amount),
        bonus: Number((_c = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _c === void 0 ? void 0 : _c.bonus),
        txnRef: String(txnData === null || txnData === void 0 ? void 0 : txnData.tx_ref),
        userId: String((_d = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _d === void 0 ? void 0 : _d.userId),
        gateway: client_1.TxnGatewayEnum.FLUTTERWAVE,
        source: client_1.TxnSourceEnum.FIAT,
        currency: String((_e = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _e === void 0 ? void 0 : _e.currency),
        coin: {
            id: String((_f = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _f === void 0 ? void 0 : _f.id),
            name: String((_g = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _g === void 0 ? void 0 : _g.name),
            amount: Number((_h = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _h === void 0 ? void 0 : _h.amount),
            price: Number((_j = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _j === void 0 ? void 0 : _j.price),
            bonus: Number((_k = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _k === void 0 ? void 0 : _k.bonus),
            isActive: Boolean((_l = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _l === void 0 ? void 0 : _l.isActive),
        },
        meta: {
            userId: String((_m = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _m === void 0 ? void 0 : _m.userId),
            telId: String((_o = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _o === void 0 ? void 0 : _o.telId),
            currency: String((_p = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _p === void 0 ? void 0 : _p.currency),
            gateway: (_q = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _q === void 0 ? void 0 : _q.gateway,
            source: (_r = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _r === void 0 ? void 0 : _r.source,
            type: String((_s = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _s === void 0 ? void 0 : _s.type),
            txn: {
                txnRef: String(txnData === null || txnData === void 0 ? void 0 : txnData.tx_ref),
                txnId: String(txnData.id),
                amount: Number(txnData === null || txnData === void 0 ? void 0 : txnData.amount),
                currency: String((_t = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _t === void 0 ? void 0 : _t.currency),
            },
            customer: txnData === null || txnData === void 0 ? void 0 : txnData.customer,
        },
    };
    return obj;
};
const subscriptionResponse = (txnData) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
    const obj = {
        planId: String((_a = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _a === void 0 ? void 0 : _a.planId),
        amount: Number((_b = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _b === void 0 ? void 0 : _b.amount),
        gateway: (_c = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _c === void 0 ? void 0 : _c.gateway,
        source: (_d = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _d === void 0 ? void 0 : _d.source,
        currency: String((_e = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _e === void 0 ? void 0 : _e.currency),
        isRecurring: Boolean((_f = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _f === void 0 ? void 0 : _f.isRecurring),
        planType: String((_g = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _g === void 0 ? void 0 : _g.planType),
        planName: String((_h = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _h === void 0 ? void 0 : _h.planName),
        meta: {
            type: String((_j = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _j === void 0 ? void 0 : _j.type),
            planId: String((_k = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _k === void 0 ? void 0 : _k.planId),
            price: Number((_l = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _l === void 0 ? void 0 : _l.price),
            discount: Number((_m = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _m === void 0 ? void 0 : _m.discount),
            tierId: (_o = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _o === void 0 ? void 0 : _o.tierId,
            amount: Number((_p = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _p === void 0 ? void 0 : _p.amount),
            planType: String((_q = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _q === void 0 ? void 0 : _q.planType),
            userId: String((_r = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _r === void 0 ? void 0 : _r.userId),
            telId: String((_s = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _s === void 0 ? void 0 : _s.telId),
            currency: String((_t = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _t === void 0 ? void 0 : _t.currency),
            gateway: (_u = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _u === void 0 ? void 0 : _u.gateway,
            source: (_v = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _v === void 0 ? void 0 : _v.source,
            txnRef: String(txnData === null || txnData === void 0 ? void 0 : txnData.tx_ref),
            txnId: String(txnData.id),
            customer: txnData === null || txnData === void 0 ? void 0 : txnData.customer,
        },
    };
    return obj;
};
const verifyFlutterwavePayment = (arg) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    try {
        const txn = yield flutterwave_1.flwAPI.Transaction.verify({ id: arg.transaction_id });
        const txnData = txn.data;
        const isSuccess = txnData.status === arg.status && txnData.tx_ref === arg.tx_ref;
        if (!isSuccess)
            return {
                status: 400,
                message: "Verification failed as this transaction wasn't successful. But if you think this is a mistake, please contact support!",
                data: null,
            };
        // check if transaction is already settled
        const tnxExists = yield db_1.default.transaction.findFirst({
            where: { exTxnRef: String(arg.tx_ref) },
        });
        if (tnxExists)
            return { message: "Transaction already settled", status: 400 };
        // compose the respective type
        if (((_a = txnData === null || txnData === void 0 ? void 0 : txnData.meta) === null || _a === void 0 ? void 0 : _a.type) === _types_1.FlutterwaveTxnType.COIN_PACKAGE) {
            return { status: 200, message: "success", data: coinsResponse(txnData) };
        }
        return {
            status: 200,
            message: "success",
            data: subscriptionResponse(txnData),
        };
    }
    catch (error) {
        const status = (_b = error === null || error === void 0 ? void 0 : error.status) !== null && _b !== void 0 ? _b : 500;
        let message = error === null || error === void 0 ? void 0 : error.message;
        if ((_c = error === null || error === void 0 ? void 0 : error.response) === null || _c === void 0 ? void 0 : _c.data) {
            message = (_f = (_e = (_d = error === null || error === void 0 ? void 0 : error.response) === null || _d === void 0 ? void 0 : _d.data) === null || _e === void 0 ? void 0 : _e.message) !== null && _f !== void 0 ? _f : message;
        }
        return { status, message, data: null };
    }
});
exports.verifyFlutterwavePayment = verifyFlutterwavePayment;
const getSubscriptionsPlan = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const plans = yield db_1.default.subscriptionPlan.findMany();
        if (plans.length === 0)
            return { plans: [], flatPlans: [] };
        const paymentPlans = plans.flatMap((plan) => {
            const tiers = plan.tier.length > 0
                ? plan.tier
                : [{ id: null, name: "", price: plan.price }];
            return tiers.flatMap((tier) => [
                {
                    planRef: `monthly_${plan.id}${tier.id ? `_${tier.id}` : ""}`,
                    name: `${config_1.appName} Monthly ${plan.name}${tier.name ? ` ${tier.name}` : ""} Plan`,
                    amount: tier.price,
                    interval: "Monthly",
                    duration: 120, // 120 months or 10 years
                    currency: client_1.TxnCurrencyEnum.USD,
                    planId: plan.id,
                    tierId: tier.id,
                    flw: null,
                },
                {
                    planRef: `yearly_${plan.id}${tier.id ? `_${tier.id}` : ""}`,
                    name: `${config_1.appName} Yearly ${plan.name}${tier.name ? ` ${tier.name}` : ""} Plan`,
                    amount: parseFloat((tier.price * 12 * (1 - plan.discount)).toFixed(2)),
                    interval: "Yearly",
                    duration: 10, // 10 years
                    currency: client_1.TxnCurrencyEnum.USD,
                    planId: plan.id,
                    tierId: tier.id,
                    flw: null,
                },
            ]);
        });
        return { plans, flatPlans: paymentPlans };
    }
    catch (error) {
        throw error;
    }
});
const createFlwPaymentPlans = (flatMap) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Map each plan to a Promise that handles the API call
        const results = yield Promise.all(flatMap.map((plan) => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            try {
                const response = yield flwAxiosAPI.post("/payment-plans", plan);
                // Add the 'flw' property to the plan with the response data
                return Object.assign(Object.assign({}, plan), { flw: (_a = response === null || response === void 0 ? void 0 : response.data) === null || _a === void 0 ? void 0 : _a.data });
            }
            catch (error) {
                // Handle error for individual plan, adding failure response
                return Object.assign(Object.assign({}, plan), { flw: null });
            }
        })));
        const succeededItems = results.filter((plan) => plan.flw !== null);
        if (succeededItems.length !== flatMap.length) {
            yield Promise.allSettled(succeededItems.map((plan) => __awaiter(void 0, void 0, void 0, function* () {
                var _a;
                try {
                    const response = yield flwAxiosAPI.put(`payment-plans/${plan.flw.id}/cancel`, { id: plan.flw.id });
                    return (_a = response === null || response === void 0 ? void 0 : response.data) === null || _a === void 0 ? void 0 : _a.data;
                }
                catch (error) {
                    return null;
                }
            })));
            return [];
        }
        return succeededItems;
    }
    catch (error) {
        throw error;
    }
});
const syncFlwSubscriptionPlans = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { plans, flatPlans } = yield getSubscriptionsPlan();
        if (flatPlans.length === 0) {
            return { data: "App subscription payment plans not found", status: 404 };
        }
        const flwPlans = yield createFlwPaymentPlans(flatPlans);
        if (flwPlans.length === 0) {
            return { data: "Error syncing app subscription payment plans to flutterwave", status: 402 };
        }
        ;
        const dbPlans = plans.map((plan) => {
            const flwData = flwPlans.filter((p) => p.planId === plan.id);
            return Object.assign(Object.assign({}, plan), { metadata: Object.assign(Object.assign({}, (plan.metadata ? plan.metadata : {})), { flw: flwData.map((item) => {
                        var _a, _b, _c, _d, _e, _f, _g, _h;
                        return {
                            flwId: (_a = item.flw) === null || _a === void 0 ? void 0 : _a.id,
                            flwToken: (_b = item.flw) === null || _b === void 0 ? void 0 : _b.plan_token,
                            flwCreatedAt: (_c = item.flw) === null || _c === void 0 ? void 0 : _c.created_at,
                            flwStatus: (_d = item.flw) === null || _d === void 0 ? void 0 : _d.status,
                            flwInterval: (_e = item.flw) === null || _e === void 0 ? void 0 : _e.interval,
                            flwCurrency: (_f = item.flw) === null || _f === void 0 ? void 0 : _f.currency,
                            flwAmount: (_g = item.flw) === null || _g === void 0 ? void 0 : _g.amount,
                            flwDuration: (_h = item.flw) === null || _h === void 0 ? void 0 : _h.duration,
                            tierId: item.tierId,
                            id: item.planId,
                            name: item.name,
                            planRef: item.planRef,
                        };
                    }) }) });
        });
        // update db payment plans
        const result = yield db_1.default.$transaction(dbPlans.map((item) => db_1.default.subscriptionPlan.update({
            where: { id: item.id },
            data: { metadata: item.metadata },
        })));
        return { data: result, status: 200 };
    }
    catch (error) {
        return { data: "Sorry an error occurred, please try again later", status: 500 };
    }
});
exports.syncFlwSubscriptionPlans = syncFlwSubscriptionPlans;
