export default class CacheInterface {
    registerApp() {
        throw new Error('You must override the get method');
    }
}