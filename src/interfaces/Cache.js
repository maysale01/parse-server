export default class CacheInterface {
    registerApp() {
        throw new Error('You must override the registerApp method');
    }

    getApp() {
        throw new Error('You must override the getApp method');
    }
}