class CacheProvider {
    constructor(cache) {
        this._cache = cache;
    }

    registerApp(appId, app) {
        this._cache.registerApp(appId, app);
    }

    set cache(value) {
        this._cache = value;
    }

    get cache() {
        return this._cache;
    }

}

export default CacheProvider;