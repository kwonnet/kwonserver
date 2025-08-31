"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserFollowAction = exports.TmaPaymentGateway = exports.FlutterwaveTxnType = exports.PlanTypeEnum = exports.BonusTypeEnum = exports.GameActionEnum = exports.WordGameType = exports.GameCatType = exports.GameType = exports.GameEventEnum = exports.GameStatusEnum = exports.CoinPayTypeEnum = void 0;
;
var CoinPayTypeEnum;
(function (CoinPayTypeEnum) {
    CoinPayTypeEnum["STARS"] = "STARS";
    CoinPayTypeEnum["FIAT"] = "FIAT";
    CoinPayTypeEnum["CRYPTO"] = "CRYPTO";
    CoinPayTypeEnum["CREDIT"] = "CREDIT";
})(CoinPayTypeEnum || (exports.CoinPayTypeEnum = CoinPayTypeEnum = {}));
var GameStatusEnum;
(function (GameStatusEnum) {
    GameStatusEnum["CHAT"] = "CHAT";
    GameStatusEnum["PLAY"] = "PLAY";
    GameStatusEnum["VOTE"] = "VOTE";
})(GameStatusEnum || (exports.GameStatusEnum = GameStatusEnum = {}));
var GameEventEnum;
(function (GameEventEnum) {
    GameEventEnum["GAME_ROOM_CHAT"] = "game_room_chat";
    GameEventEnum["GAME_ROOM_SCORE"] = "game_room_score";
    GameEventEnum["GAME_ROOM_STATE"] = "game_room_state";
    GameEventEnum["GAME_ROOM_PLAYERS"] = "game_room_players";
    GameEventEnum["GAME_ROOM_QUESTION"] = "game_room_question";
    GameEventEnum["GAME_ROOM_ANSWER"] = "game_room_answer";
    GameEventEnum["GAME_ROOM_ANSWERS"] = "game_room_answers";
    GameEventEnum["GAME_ROOM_VOTE"] = "game_room_vote";
    GameEventEnum["GAME_ROOM_PARTICIPANTS"] = "game_room_participants";
    GameEventEnum["GAME_ROOM_ACHIEVEMENT"] = "game_room_achievement";
    GameEventEnum["GAME_TOTAL_PLAYERS"] = "game_total_players";
    GameEventEnum["GAME_ERROR_NOTIFY"] = "game_error_notify";
    GameEventEnum["GAME_PLAYER_ENERGY"] = "game_player_energy";
    GameEventEnum["GAME_PLAYER_DATA"] = "game_player_data";
    GameEventEnum["GAME_ROOM_INFO"] = "game_room_info";
    GameEventEnum["GAME_PLAYER_WALLET_UPDATE"] = "game_player_wallet_update";
    GameEventEnum["PLAYER_JOINED"] = "player_joined";
    GameEventEnum["MESSAGE"] = "message";
    GameEventEnum["NOTIFY_MESSAGE"] = "notify_message";
})(GameEventEnum || (exports.GameEventEnum = GameEventEnum = {}));
var GameType;
(function (GameType) {
    GameType["TRIVIA"] = "TRIVIA";
    GameType["ACRONYM"] = "ACRONYM";
    GameType["MINDMASH"] = "MINDMASH";
    GameType["SPORTS"] = "SPORTS";
    GameType["COUNTRY"] = "COUNTRY";
    GameType["ACADEMIA"] = "ACADEMIA";
})(GameType || (exports.GameType = GameType = {}));
var GameCatType;
(function (GameCatType) {
    GameCatType["TYPEMANIA"] = "TYPEMANIA";
    GameCatType["HANGMAN"] = "HANGMAN";
    GameCatType["ANAGRAM"] = "ANAGRAM";
    GameCatType["UNSCRAMBLE"] = "UNSCRAMBLE";
    GameCatType["WORDMAKER"] = "WORDMAKER";
    GameCatType["LUCKYFLIP"] = "LUCKYFLIP";
    GameCatType["LUCKYWHIZ"] = "LUCKYWHIZ";
    GameCatType["LUCKYSPIN"] = "LUCKYSPIN";
})(GameCatType || (exports.GameCatType = GameCatType = {}));
var WordGameType;
(function (WordGameType) {
    WordGameType["LETTER"] = "LETTER";
    WordGameType["WORD"] = "WORD";
    WordGameType["NUMBER"] = "NUMBER";
})(WordGameType || (exports.WordGameType = WordGameType = {}));
var GameActionEnum;
(function (GameActionEnum) {
    GameActionEnum["CHAT"] = "CHAT";
    GameActionEnum["ANSWER"] = "ANSWER";
    GameActionEnum["ENTRIES"] = "ENTRIES";
    GameActionEnum["VOTE"] = "VOTE";
})(GameActionEnum || (exports.GameActionEnum = GameActionEnum = {}));
var BonusTypeEnum;
(function (BonusTypeEnum) {
    BonusTypeEnum["BONUS"] = "BONUS";
    BonusTypeEnum["ADS"] = "ADS";
})(BonusTypeEnum || (exports.BonusTypeEnum = BonusTypeEnum = {}));
var PlanTypeEnum;
(function (PlanTypeEnum) {
    PlanTypeEnum["MONTHLY"] = "MONTHLY";
    PlanTypeEnum["YEARLY"] = "YEARLY";
})(PlanTypeEnum || (exports.PlanTypeEnum = PlanTypeEnum = {}));
var FlutterwaveTxnType;
(function (FlutterwaveTxnType) {
    FlutterwaveTxnType["COIN_PACKAGE"] = "COIN_PACKAGE";
    FlutterwaveTxnType["APP_SUBSCRIPTION"] = "APP_SUBSCRIPTION";
})(FlutterwaveTxnType || (exports.FlutterwaveTxnType = FlutterwaveTxnType = {}));
var TmaPaymentGateway;
(function (TmaPaymentGateway) {
    TmaPaymentGateway["STARS"] = "STARS";
    TmaPaymentGateway["SMART_GLOCAL"] = "SMART_GLOCAL";
    TmaPaymentGateway["UNLIMINT"] = "UNLIMINT";
})(TmaPaymentGateway || (exports.TmaPaymentGateway = TmaPaymentGateway = {}));
var UserFollowAction;
(function (UserFollowAction) {
    UserFollowAction["FOLLOW"] = "FOLLOW";
    UserFollowAction["UNFOLLOW"] = "UNFOLLOW";
    UserFollowAction["ACCEPT"] = "ACCEPT";
    UserFollowAction["REJECT"] = "REJECT";
    UserFollowAction["CANCEL"] = "CANCEL";
})(UserFollowAction || (exports.UserFollowAction = UserFollowAction = {}));
