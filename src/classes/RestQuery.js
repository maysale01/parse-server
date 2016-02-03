// An object that encapsulates everything we need to run a 'find'
// operation, encoded in the REST API format.

import { Parse } from 'parse/node';

// restOptions can include:
//   skip
//   limit
//   order
//   count
//   include
//   keys
//   redirectClassNameForKey

class RestQuery {
    constructor(config, auth, className, restWhere = {}, restOptions = {}) {
        this._config = config;
        this._auth = auth;
        this._className = className;
        this._restWhere = restWhere;
        this._response = null;

        this._findOptions = {};

        if (!this._auth.isMaster) {
            this._findOptions.acl = this._auth.user ? [this._auth.user.id] : null;
            if (this._className == '_Session') {
                if (!this._findOptions.acl) {
                    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'This session token is invalid.');
                }
                this._restWhere = {
                    '$and': [this._restWhere, {
                        'user': {
                            __type: 'Pointer',
                            className: '_User',
                            objectId: this._auth.user.id
                        }
                    }]
                };
            }
        }

        this._doCount = false;
        // The format for this.include is not the same as the format for the
        // include option - it's the paths we should include, in order,
        // stored as arrays, taking into account that we need to include foo
        // before including foo.bar. Also it should dedupe.
        // For example, passing an arg of include=foo.bar,foo.baz could lead to
        // this.include = [['foo'], ['foo', 'baz'], ['foo', 'bar']]
        this._include = [];

        for (let option in restOptions) {
            switch(option) {
            case 'keys':
                this._keys = new Set(restOptions.keys.split(','));
                this._keys.add('objectId');
                this._keys.add('createdAt');
                this._keys.add('updatedAt');
                break;
            case 'count':
                this._doCount = true;
                break;
            case 'skip':
            case 'limit':
                this._findOptions[option] = restOptions[option];
                break;
            case 'order':
                let fields = restOptions.order.split(',');
                let sortMap = {};
                for (let field of fields) {
                    if (field[0] == '-') {
                        sortMap[field.slice(1)] = -1;
                    } else {
                        sortMap[field] = 1;
                    }
                }
                this._findOptions.sort = sortMap;
                break;
            case 'include':
                let paths = restOptions.include.split(',');
                let pathSet = {};
                for (let path of paths) {
                    // Add all prefixes with a .-split to pathSet
                    let parts = path.split('.');
                    for (let len = 1; len <= parts.length; len++) {
                        pathSet[parts.slice(0, len).join('.')] = true;
                    }
                }
                this._include = Object.keys(pathSet)
                .sort((a, b) => {
                    return a.length - b.length;
                }).map((s) => {
                    return s.split('.');
                });
                break;
            case 'redirectClassNameForKey':
                this._redirectKey = restOptions.redirectClassNameForKey;
                this._redirectClassName = null;
                break;
            default:
                throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad option: ' + option);
            }
        }
    }

    get config () {
        return this._config;
    }

    get auth () {
        return this._auth;
    }

    get className () {
        return this._className;
    }

    get restWhere () {
        return this._restWhere;
    }

    get response () {
        return this._response;
    }

    get findOptions () {
        return this._findOptions;
    }

    get doCount () {
        return this._doCount;
    }

    get include () {
        return this._include;
    }

    get keys () {
        return this._keys;
    }

    get redirectKey () {
        return this._redirectKey;
    }

    get redirectClassName () {
        return this._redirectClassName;
    }

    set config (value) {
        this._config = value;
    }

    set auth (value) {
        this._auth = value;
    }

    set className (value) {
        this._className = value;
    }

    set restWhere (value) {
        this._restWhere = value;
    }

    set response (value) {
        this._response = value;
    }

    set findOptions (value) {
        this._findOptions = value;
    }

    set doCount (value) {
        this._doCount = value;
    }

    set include (value) {
        this._include = value;
    }

    set keys (value) {
        this._keys = value;
    }

    set redirectKey (value) {
        this._redirectKey = value;
    }

    set redirectClassName (value) {
        this._redirectClassName = value;
    }

    // A convenient method to perform all the steps of processing a query
    // in order.
    // Returns a promise for the response - an object with optional keys
    // 'results' and 'count'.
    // TODO: consolidate the replaceX functions
    execute() {
        return Promise.resolve().then(() => {
            return this.getUserAndRoleACL();
        }).then(() => {
            return this.redirectClassNameForKey();
        }).then(() => {
            return this.replaceSelect();
        }).then(() => {
            return this.replaceDontSelect();
        }).then(() => {
            return this.replaceInQuery();
        }).then(() => {
            return this.replaceNotInQuery();
        }).then(() => {
            return this.runFind();
        }).then(() => {
            return this.runCount();
        }).then(() => {
            return this.handleInclude();
        }).then(() => {
            return this.response;
        });
    }

    // Uses the Auth object to get the list of roles, adds the user id
    getUserAndRoleACL() {
        if (this.auth.isMaster || !this.auth.user) {
            return Promise.resolve();
        }
        return this.auth.getUserRoles()
        .then((roles) => {
            roles.push(this.auth.user.id);
            this.findOptions.acl = roles;
            return Promise.resolve();
        });
    }

    // Changes the className if redirectClassNameForKey is set.
    // Returns a promise.
    redirectClassNameForKey() {
        if (!this.redirectKey) {
            return Promise.resolve();
        }
        // We need to change the class name based on the schema
        return this.config.database.redirectClassNameForKey(
        this.className, this.redirectKey)
        .then((newClassName) => {
            this.className = newClassName;
            this.redirectClassName = newClassName;
        });
    }

    // Replaces a $inQuery clause by running the subquery, if there is an
    // $inQuery clause.
    // The $inQuery clause turns into an $in with values that are just
    // pointers to the objects returned in the subquery.
    replaceInQuery() {
        let inQueryObject = findObjectWithKey(this.restWhere, '$inQuery');
        if (!inQueryObject) {
            return;
        }

        // The inQuery value must have precisely two keys - where and className
        let inQueryValue = inQueryObject['$inQuery'];
        if (!inQueryValue.where || !inQueryValue.className) {
            throw new Parse.Error(Parse.Error.INVALID_QUERY,
                              'improper usage of $inQuery');
        }

        let subquery = new RestQuery(
        this.config, this.auth, inQueryValue.className,
        inQueryValue.where);
        return subquery.execute().then((response) => {
            let values = [];
            for (let result of response.results) {
                values.push({
                    __type: 'Pointer',
                    className: inQueryValue.className,
                    objectId: result.objectId
                });
            }
            delete inQueryObject['$inQuery'];
            inQueryObject['$in'] = values;

            // Recurse to repeat
            return this.replaceInQuery();
        });
    }


    // Replaces a $notInQuery clause by running the subquery, if there is an
    // $notInQuery clause.
    // The $notInQuery clause turns into a $nin with values that are just
    // pointers to the objects returned in the subquery.
    replaceNotInQuery() {

        let notInQueryObject = findObjectWithKey(this.restWhere, '$notInQuery');
        if (!notInQueryObject) {
            return;
        }

        // The notInQuery value must have precisely two keys - where and className
        let notInQueryValue = notInQueryObject['$notInQuery'];
        if (!notInQueryValue.where || !notInQueryValue.className) {
            throw new Parse.Error(Parse.Error.INVALID_QUERY, 'improper usage of $notInQuery');
        }

        let subquery = new RestQuery(this.config, this.auth, notInQueryValue.className, notInQueryValue.where);
        return subquery.execute()
        .then((response) => {
            let values = [];
            for (let result of response.results) {
                values.push({
                    __type: 'Pointer',
                    className: notInQueryValue.className,
                    objectId: result.objectId
                });
            }
            delete notInQueryObject['$notInQuery'];
            notInQueryObject['$nin'] = values;

            // Recurse to repeat
            return this.replaceNotInQuery();
        });
    }

    // Replaces a $select clause by running the subquery, if there is a
    // $select clause.
    // The $select clause turns into an $in with values selected out of
    // the subquery.
    // Returns a possible-promise.
    replaceSelect() {
        let selectObject = findObjectWithKey(this.restWhere, '$select');
        if (!selectObject) {
            return;
        }

        // The select value must have precisely two keys - query and key
        let selectValue = selectObject['$select'];
        if (!selectValue.query ||
          !selectValue.key ||
          typeof selectValue.query !== 'object' ||
          !selectValue.query.className ||
          !selectValue.query.where ||
          Object.keys(selectValue).length !== 2) {
            throw new Parse.Error(Parse.Error.INVALID_QUERY,
                              'improper usage of $select');
        }

        let subquery = new RestQuery(
        this.config, this.auth, selectValue.query.className,
        selectValue.query.where);
        return subquery.execute().then((response) => {
            let values = [];
            for (let result of response.results) {
                values.push(result[selectValue.key]);
            }
            delete selectObject['$select'];
            selectObject['$in'] = values;

            // Keep replacing $select clauses
            return this.replaceSelect();
        });
    }


    // Replaces a $dontSelect clause by running the subquery, if there is a
    // $dontSelect clause.
    // The $dontSelect clause turns into an $nin with values selected out of
    // the subquery.
    // Returns a possible-promise.
    replaceDontSelect() {
        let dontSelectObject = findObjectWithKey(this.restWhere, '$dontSelect');
        if (!dontSelectObject) {
            return;
        }

        // The dontSelect value must have precisely two keys - query and key
        let dontSelectValue = dontSelectObject['$dontSelect'];
        if (!dontSelectValue.query ||
          !dontSelectValue.key ||
          typeof dontSelectValue.query !== 'object' ||
          !dontSelectValue.query.className ||
          !dontSelectValue.query.where ||
          Object.keys(dontSelectValue).length !== 2) {
            throw new Parse.Error(Parse.Error.INVALID_QUERY,
                              'improper usage of $dontSelect');
        }

        let subquery = new RestQuery(
        this.config, this.auth, dontSelectValue.query.className,
        dontSelectValue.query.where);
        return subquery.execute().then((response) => {
            let values = [];
            for (let result of response.results) {
                values.push(result[dontSelectValue.key]);
            }
            delete dontSelectObject['$dontSelect'];
            dontSelectObject['$nin'] = values;

            // Keep replacing $dontSelect clauses
            return this.replaceDontSelect();
        });
    }

    // Returns a promise for whether it was successful.
    // Populates this.response with an object that only has 'results'.
    runFind() {
        return this.config.database.find(this.className, this.restWhere, this.findOptions)
        .then((results) => {
            if (this.className == '_User') {
                for (let result of results) {
                    delete result.password;
                }
            }

            updateParseFiles(this.config, results);

            if (this.keys) {
                let keySet = this.keys;
                results = results.map((object) => {
                    let newObject = {};
                    for (let key in object) {
                        if (keySet.has(key)) {
                            newObject[key] = object[key];
                        }
                    }
                    return newObject;
                });
            }

            if (this.redirectClassName) {
                for (let r of results) {
                    r.className = this.redirectClassName;
                }
            }

            this.response = {results: results};
        });
    }

    // Returns a promise for whether it was successful.
    // Populates this.response.count with the count
    runCount() {
        if (!this.doCount) {
            return;
        }
        this.findOptions.count = true;
        delete this.findOptions.skip;
        return this.config.database.find(this.className, this.restWhere, this.findOptions)
        .then((c) => {
            this.response.count = c;
        });
    }

    // Augments this.response with data at the paths provided in this.include.
    handleInclude() {
        if (this.include.length == 0) {
            return;
        }

        let pathResponse = includePath(this.config, this.auth,
                                     this.response, this.include[0]);
        if (pathResponse.then) {
            return pathResponse
            .then((newResponse) => {
                this.response = newResponse;
                this.include = this.include.slice(1);
                return this.handleInclude();
            });
        }
        return pathResponse;
    }
}

// Adds included values to the response.
// Path is a list of field names.
// Returns a promise for an augmented response.
export function includePath(config, auth, response, path) {
    let pointers = findPointers(response.results, path);
    if (pointers.length == 0) {
        return response;
    }
    let className = null;
    let objectIds = {};
    for (let pointer of pointers) {
        if (className === null) {
            className = pointer.className;
        } else {
            if (className != pointer.className) {
                throw new Parse.Error(Parse.Error.INVALID_JSON,
                              'inconsistent type data for include');
            }
        }
        objectIds[pointer.objectId] = true;
    }
    if (!className) {
        throw new Parse.Error(Parse.Error.INVALID_JSON,
                          'bad pointers');
    }

  // Get the objects for all these object ids
    let where = {'objectId': {'$in': Object.keys(objectIds)}};
    let query = new RestQuery(config, auth, className, where);
    return query.execute().then((includeResponse) => {
        let replace = {};
        for (let obj of includeResponse.results) {
            obj.__type = 'Object';
            obj.className = className;
            replace[obj.objectId] = obj;
        }
        let resp = {
            results: replacePointers(response.results, path, replace)
        };
        if (response.count) {
            resp.count = response.count;
        }
        return resp;
    });
}

// Object may be a list of REST-format object to find pointers in, or
// it may be a single object.
// If the path yields things that aren't pointers, this throws an error.
// Path is a list of fields to search into.
// Returns a list of pointers in REST format.
export function findPointers(object, path) {
    if (object instanceof Array) {
        let answer = [];
        for (let x of object) {
            answer = answer.concat(findPointers(x, path));
        }
        return answer;
    }

    if (typeof object !== 'object') {
        throw new Parse.Error(Parse.Error.INVALID_QUERY,
                          'can only include pointer fields');
    }

    if (path.length == 0) {
        if (object.__type == 'Pointer') {
            return [object];
        }
        throw new Parse.Error(Parse.Error.INVALID_QUERY,
                          'can only include pointer fields');
    }

    let subobject = object[path[0]];
    if (!subobject) {
        return [];
    }
    return findPointers(subobject, path.slice(1));
}

// Object may be a list of REST-format objects to replace pointers
// in, or it may be a single object.
// Path is a list of fields to search into.
// replace is a map from object id -> object.
// Returns something analogous to object, but with the appropriate
// pointers inflated.
export function replacePointers(object, path, replace) {
    if (object instanceof Array) {
        return object.map((obj) => replacePointers(obj, path, replace));
    }

    if (typeof object !== 'object') {
        return object;
    }

    if (path.length == 0) {
        if (object.__type == 'Pointer' && replace[object.objectId]) {
            return replace[object.objectId];
        }
        return object;
    }

    let subobject = object[path[0]];
    if (!subobject) {
        return object;
    }
    let newsub = replacePointers(subobject, path.slice(1), replace);
    let answer = {};
    for (let key in object) {
        if (key == path[0]) {
            answer[key] = newsub;
        } else {
            answer[key] = object[key];
        }
    }
    return answer;
}

// Find file references in REST-format object and adds the url key
// with the current mount point and app id
// Object may be a single object or list of REST-format objects
export function updateParseFiles(config, object) {
    if (object instanceof Array) {
        object.map((obj) => updateParseFiles(config, obj));
        return;
    }
    if (typeof object !== 'object') {
        return;
    }
    for (let key in object) {
        if (object[key] &&  object[key]['__type'] &&
        object[key]['__type'] == 'File') {
            let filename = object[key]['name'];
            let encoded = encodeURIComponent(filename);
            encoded = encoded.replace('%40', '@');
            if (filename.indexOf('tfss-') === 0) {
                object[key]['url'] = 'http://files.parsetfss.com/' +
          config.fileKey + '/' + encoded;
            } else {
                object[key]['url'] = config.mount + '/files/' +
                           config.applicationId + '/' +
                           encoded;
            }
        }
    }
}

// Finds a subobject that has the given key, if there is one.
// Returns undefined otherwise.
export function findObjectWithKey(root, key) {
    if (typeof root !== 'object') {
        return;
    }
    if (root instanceof Array) {
        for (let item of root) {
            let answer = findObjectWithKey(item, key);
            if (answer) {
                return answer;
            }
        }
    }
    if (root && root[key]) {
        return root;
    }
    for (let subkey in root) {
        let answer = findObjectWithKey(root[subkey], key);
        if (answer) {
            return answer;
        }
    }
}

export default RestQuery;
