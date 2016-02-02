var request = require('request');
require('../spec/helpers/parse');

var DatabaseAdapter = require('../src/classes/DatabaseAdapter');

describe('miscellaneous', function() {
  it('create a GameScore object', function(done) {
    var obj = new Parse.Object('GameScore');
    obj.set('score', 1337);
    obj.save().then(function(obj) {
      expect(obj.id).to.be.a('string');
      expect(obj.createdAt.toGMTString()).to.be.a('string');
      done();
    }, (err) => { 
        console.error(err, err.stack); }
    );
  });

  it('get a TestObject', function(done) {
    create({ 'bloop' : 'blarg' }, function(obj) {
      var t2 = new TestObject({ objectId: obj.id });
      t2.fetch({
        success: function(obj2) {
          expect(obj2.get('bloop')).to.be.equal('blarg');
          expect(obj2.id).to.be.ok;
          expect(obj2.id).to.be.equal(obj.id);
          done();
        },
        error: fail
      });
    });
  });

  it('create a valid parse user', function(done) {
    createTestUser(function(data) {
      expect(data.id).to.be.ok;
      expect(data.getSessionToken()).to.be.ok;
      expect(data.get('password')).to.not.be.ok;
      done();
    }, function(err) {
      fail(err);
    });
  });

  it('fail to create a duplicate username', function(done) {
    createTestUser(function(data) {
      createTestUser(function(data) {
        fail('Should not have been able to save duplicate username.');
      }, function(error) {
        expect(error.code).to.be.equal(Parse.Error.USERNAME_TAKEN);
        done();
      });
    });
  });

  it('succeed in logging in', function(done) {
    createTestUser(function(u) {
      expect(typeof u.id).to.be.equal('string');

      Parse.User.logIn('test', 'moon-y', {
        success: function(user) {
          expect(typeof user.id).to.be.equal('string');
          expect(user.get('password')).to.not.be.ok;
          expect(user.getSessionToken()).to.be.ok;
          Parse.User.logOut();
          done();
        }, error: function(error) {
          fail(error);
        }
      });
    }, fail);
  });

  it('increment with a user object', function(done) {
    createTestUser().then((user) => {
      user.increment('foo');
      return user.save();
    }).then(() => {
      return Parse.User.logIn('test', 'moon-y');
    }).then((user) => {
      expect(user.get('foo')).to.be.equal(1);
      user.increment('foo');
      return user.save();
    }).then(() => {
      Parse.User.logOut();
      return Parse.User.logIn('test', 'moon-y');
    }).then((user) => {
      expect(user.get('foo')).to.be.equal(2);
      Parse.User.logOut();
      done();
    }, (error) => {
      fail(error);
      done();
    });
  });

  it('save various data types', function(done) {
    var obj = new TestObject();
    obj.set('date', new Date());
    obj.set('array', [1, 2, 3]);
    obj.set('object', {one: 1, two: 2});
    obj.save().then(() => {
      var obj2 = new TestObject({objectId: obj.id});
      return obj2.fetch();
    }).then((obj2) => {
      expect(obj2.get('date')).to.be.a('date');
      expect(obj2.get('array')).to.be.a('array');
      expect(obj2.get('object')).to.be.a('object');
      expect(obj2.get('object')).to.be.a('object');
      done();
    });
  });

  it('query with limit', function(done) {
    var baz = new TestObject({ foo: 'baz' });
    var qux = new TestObject({ foo: 'qux' });
    baz.save().then(() => {
      return qux.save();
    }).then(() => {
      var query = new Parse.Query(TestObject);
      query.limit(1);
      return query.find();
    }).then((results) => {
      expect(results.length).to.be.equal(1);
      done();
    }, (error) => {
      fail(error);
      done();
    });
  });

  it('basic saveAll', function(done) {
    var alpha = new TestObject({ letter: 'alpha' });
    var beta = new TestObject({ letter: 'beta' });
    Parse.Object.saveAll([alpha, beta]).then(() => {
      expect(alpha.id).to.be.ok;
      expect(beta.id).to.be.ok;
      return new Parse.Query(TestObject).find();
    }).then((results) => {
      expect(results.length).to.be.equal(2);
      done();
    }, (error) => {
      fail(error);
      done();
    });
  });

  it('test cloud function', function(done) {
    Parse.Cloud.run('hello', {}, function(result) {
      expect(result).to.be.equal('Hello world!');
      done();
    });
  });

  it('basic beforeSave rejection', function(done) {
    var obj = new Parse.Object('BeforeSaveFailure');
    obj.set('foo', 'bar');
    obj.save().then(function() {
      fail('Should not have been able to save BeforeSaveFailure class.');
      done();
    }, function(error) {
      done();
    })
  });

  it('test beforeSave unchanged success', function(done) {
    var obj = new Parse.Object('BeforeSaveUnchanged');
    obj.set('foo', 'bar');
    obj.save().then(function() {
      done();
    }, function(error) {
      fail(error);
      done();
    });
  });

  it('test beforeSave changed object success', function(done) {
    var obj = new Parse.Object('BeforeSaveChanged');
    obj.set('foo', 'bar');
    obj.save().then(function() {
      var query = new Parse.Query('BeforeSaveChanged');
      query.get(obj.id).then(function(objAgain) {
        expect(objAgain.get('foo')).to.be.equal('baz');
        done();
      }, function(error) {
        fail(error);
        done();
      });
    }, function(error) {
      fail(error);
      done();
    });
  });

  it('test afterSave ran and created an object', function(done) {
    var obj = new Parse.Object('AfterSaveTest');
    obj.save();

    setTimeout(function() {
      var query = new Parse.Query('AfterSaveProof');
      query.equalTo('proof', obj.id);
      query.find().then(function(results) {
        expect(results.length).to.be.equal(1);
        done();
      }, function(error) {
        fail(error);
        done();
      });
    }, 500);
  });

  it('test beforeSave happens on update', function(done) {
    var obj = new Parse.Object('BeforeSaveChanged');
    obj.set('foo', 'bar');
    obj.save().then(function() {
      obj.set('foo', 'bar');
      return obj.save();
    }).then(function() {
      var query = new Parse.Query('BeforeSaveChanged');
      return query.get(obj.id).then(function(objAgain) {
        expect(objAgain.get('foo')).to.be.equal('baz');
        done();
      });
    }, function(error) {
      fail(error);
      done();
    });
  });

  it('test beforeDelete failure', function(done) {
    var obj = new Parse.Object('BeforeDeleteFail');
    var id;
    obj.set('foo', 'bar');
    obj.save().then(() => {
      id = obj.id;
      return obj.destroy();
    }).then(() => {
      fail('obj.destroy() should have failed, but it succeeded');
      done();
    }, (error) => {
      expect(error.code).to.be.equal(Parse.Error.SCRIPT_FAILED);
      expect(error.message).to.be.equal('Nope');

      var objAgain = new Parse.Object('BeforeDeleteFail', {objectId: id});
      return objAgain.fetch();
    }).then((objAgain) => {
      expect(objAgain.get('foo')).to.be.equal('bar');
      done();
    }, (error) => {
      // We should have been able to fetch the object again
      fail(error);
    });
  });

  it('test beforeDelete success', function(done) {
    var obj = new Parse.Object('BeforeDeleteTest');
    obj.set('foo', 'bar');
    obj.save().then(function() {
      return obj.destroy();
    }).then(function() {
      var objAgain = new Parse.Object('BeforeDeleteTest', obj.id);
      return objAgain.fetch().then(() => {
        fail();
      }, () => {
        done();
      });
    }, function(error) {
      fail(error);
      done();
    });
  });

  it('test afterDelete ran and created an object', function(done) {
    var obj = new Parse.Object('AfterDeleteTest');
    obj.save().then(function() {
      obj.destroy();
    });

    setTimeout(function() {
      var query = new Parse.Query('AfterDeleteProof');
      query.equalTo('proof', obj.id);
      query.find().then(function(results) {
        expect(results.length).to.be.equal(1);
        done();
      }, function(error) {
        fail(error);
        done();
      });
    }, 500);
  });

  it('test save triggers get user', function(done) {
    var user = new Parse.User();
    user.set("password", "asdf");
    user.set("email", "asdf@example.com");
    user.set("username", "zxcv");
    user.signUp(null, {
      success: function() {
        var obj = new Parse.Object('SaveTriggerUser');
        obj.save().then(function() {
          done();
        }, function(error) {
          fail(error);
          done();
        });
      }
    });
  });

  it('test cloud function return types', function(done) {
    Parse.Cloud.run('foo').then((result) => {
      expect(result.object instanceof Parse.Object).to.be.ok;
      expect(result.object.className).to.be.equal('Foo');
      expect(result.object.get('x')).to.be.equal(2);
      var bar = result.object.get('relation');
      expect(bar instanceof Parse.Object).to.be.ok;
      expect(bar.className).to.be.equal('Bar');
      expect(bar.get('x')).to.be.equal(3);
      expect(Array.isArray(result.array)).to.be.equal(true);
      expect(result.array[0] instanceof Parse.Object).to.be.ok;
      expect(result.array[0].get('x')).to.be.equal(2);
      done();
    });
  });

  it('test rest_create_app', function(done) {
    var appId;
    Parse._request('POST', 'rest_create_app').then((res) => {
      expect(typeof res.application_id).to.be.equal('string');
      expect(res.master_key).to.be.equal('master');
      appId = res.application_id;
      Parse.initialize(appId, 'unused');
      var obj = new Parse.Object('TestObject');
      obj.set('foo', 'bar');
      return obj.save();
    }).then(() => {
      var db = DatabaseAdapter.getDatabaseConnection(appId);
      return db.mongoFind('TestObject', {}, {});
    }).then((results) => {
      expect(results.length).to.be.equal(1);
      expect(results[0]['foo']).to.be.equal('bar');
      done();
    });
  });

  it('test beforeSave get full object on create and update', function(done) {
    var triggerTime = 0;
    // Register a mock beforeSave hook
    Parse.Cloud.beforeSave('GameScore', function(req, res) {
      var object = req.object;
      expect(object instanceof Parse.Object).to.be.ok;
      expect(object.get('fooAgain')).to.be.equal('barAgain');
      expect(object.id).to.be.ok;
      expect(object.createdAt).to.be.ok;
      expect(object.updatedAt).to.be.ok;
      if (triggerTime == 0) {
        // Create
        expect(object.get('foo')).to.be.equal('bar');
      } else if (triggerTime == 1) {
        // Update
        expect(object.get('foo')).to.be.equal('baz');
      } else {
        res.error();
      }
      triggerTime++;
      res.success();
    });

    var obj = new Parse.Object('GameScore');
    obj.set('foo', 'bar');
    obj.set('fooAgain', 'barAgain');
    obj.save().then(function() {
      // We only update foo
      obj.set('foo', 'baz');
      return obj.save();
    }).then(function() {
      // Make sure the checking has been triggered
      expect(triggerTime).to.be.equal(2);
      // Clear mock beforeSave
      delete Parse.Cloud.Triggers.beforeSave.GameScore;
      done();
    }, function(error) {
      fail(error);
      done();
    });
  });

  it('test afterSave get full object on create and update', function(done) {
    var triggerTime = 0;
    // Register a mock beforeSave hook
    Parse.Cloud.afterSave('GameScore', function(req, res) {
      var object = req.object;
      expect(object instanceof Parse.Object).to.be.ok;
      expect(object.get('fooAgain')).to.be.equal('barAgain');
      expect(object.id).to.be.ok;
      expect(object.createdAt).to.be.ok;
      expect(object.updatedAt).to.be.ok;
      if (triggerTime == 0) {
        // Create
        expect(object.get('foo')).to.be.equal('bar');
      } else if (triggerTime == 1) {
        // Update
        expect(object.get('foo')).to.be.equal('baz');
      } else {
        res.error();
      }
      triggerTime++;
      res.success();
    });

    var obj = new Parse.Object('GameScore');
    obj.set('foo', 'bar');
    obj.set('fooAgain', 'barAgain');
    obj.save().then(function() {
      // We only update foo
      obj.set('foo', 'baz');
      return obj.save();
    }).then(function() {
      // Make sure the checking has been triggered
      expect(triggerTime).to.be.equal(2);
      // Clear mock afterSave
      delete Parse.Cloud.Triggers.afterSave.GameScore;
      done();
    }, function(error) {
      fail(error);
      done();
    });
  });

  it('test beforeSave get original object on update', function(done) {
    var triggerTime = 0;
    // Register a mock beforeSave hook
    Parse.Cloud.beforeSave('GameScore', function(req, res) {
      var object = req.object;
      expect(object instanceof Parse.Object).to.be.ok;
      expect(object.get('fooAgain')).to.be.equal('barAgain');
      expect(object.id).to.be.ok;
      expect(object.createdAt).to.be.ok;
      expect(object.updatedAt).to.be.ok;
      try {
          var originalObject = req.original;
          if (triggerTime == 0) {
            // Create
            expect(object.get('foo')).to.be.equal('bar');
            // Check the originalObject is undefined
            expect(originalObject).to.be.ok;
          } else if (triggerTime == 1) {
            // Update
            expect(object.get('foo')).to.be.equal('baz');
            // Check the originalObject
            expect(originalObject instanceof Parse.Object).to.be.ok;
            expect(originalObject.get('fooAgain')).to.be.equal('barAgain');
            expect(originalObject.id).to.be.ok;
            expect(originalObject.createdAt).to.be.ok;
            expect(originalObject.updatedAt).to.be.ok;
            expect(originalObject.get('foo')).to.be.equal('bar');
          } else {
            res.error();
          }
          triggerTime++;
          res.success();
      } catch (error) {
        res.error(error);
      }
    });

    var obj = new Parse.Object('GameScore');
    obj.set('foo', 'bar');
    obj.set('fooAgain', 'barAgain');
    obj.save().then(function() {
      // We only update foo
      obj.set('foo', 'baz');
      return obj.save();
    }).then(function() {
      // Make sure the checking has been triggered
      expect(triggerTime).to.be.equal(2);
      // Clear mock beforeSave
      delete Parse.Cloud.Triggers.beforeSave.GameScore;
      done();
    }, function(error) {
      fail(error);
      done();
    });
  });

  it('test afterSave get original object on update', function(done) {
    var triggerTime = 0;
    // Register a mock beforeSave hook
    Parse.Cloud.afterSave('GameScore', function(req, res) {
      var object = req.object;
      expect(object instanceof Parse.Object).to.be.ok;
      expect(object.get('fooAgain')).to.be.equal('barAgain');
      expect(object.id).to.be.ok;
      expect(object.createdAt).to.be.ok;
      expect(object.updatedAt).to.be.ok;
      var originalObject = req.original;
      if (triggerTime == 0) {
        // Create
        expect(object.get('foo')).to.be.equal('bar');
        // Check the originalObject is undefined
        expect(originalObject).to.be.ok;
      } else if (triggerTime == 1) {
        // Update
        expect(object.get('foo')).to.be.equal('baz');
        // Check the originalObject
        expect(originalObject instanceof Parse.Object).to.be.ok;
        expect(originalObject.get('fooAgain')).to.be.equal('barAgain');
        expect(originalObject.id).to.be.ok;
        expect(originalObject.createdAt).to.be.ok;
        expect(originalObject.updatedAt).to.be.ok;
        expect(originalObject.get('foo')).to.be.equal('bar');
      } else {
        res.error();
      }
      triggerTime++;
      res.success();
    });

    var obj = new Parse.Object('GameScore');
    obj.set('foo', 'bar');
    obj.set('fooAgain', 'barAgain');
    obj.save().then(function() {
      // We only update foo
      obj.set('foo', 'baz');
      return obj.save();
    }).then(function() {
      // Make sure the checking has been triggered
      expect(triggerTime).to.be.equal(2);
      // Clear mock afterSave
      delete Parse.Cloud.Triggers.afterSave.GameScore;
      done();
    }, function(error) {
      fail(error);
      done();
    });
  });

  it('test cloud function error handling', (done) => {
    // Register a function which will fail
    Parse.Cloud.define('willFail', (req, res) => {
      res.error('noway');
    });
    Parse.Cloud.run('willFail').then((s) => {
      fail('Should not have succeeded.');
      delete Parse.Cloud.Functions['willFail'];
      done();
    }, (e) => {
      expect(e.code).to.be.equal(141);
      expect(e.message).to.be.equal('noway');
      delete Parse.Cloud.Functions['willFail'];
      done();
    });
  });

  it('fails on invalid client key', done => {
    var headers = {
      'Content-Type': 'application/octet-stream',
      'X-Parse-Application-Id': 'test',
      'X-Parse-Client-Key': 'notclient'
    };
    request.get({
      headers: headers,
      url: 'http://localhost:8378/1/classes/TestObject'
    }, (error, response, body) => {
      expect(error).to.be.equal(null);
      var b = JSON.parse(body);
      expect(b.error).to.be.equal('unauthorized');
      done();
    });
  });

  it('fails on invalid windows key', done => {
    var headers = {
      'Content-Type': 'application/octet-stream',
      'X-Parse-Application-Id': 'test',
      'X-Parse-Windows-Key': 'notwindows'
    };
    request.get({
      headers: headers,
      url: 'http://localhost:8378/1/classes/TestObject'
    }, (error, response, body) => {
      expect(error).to.be.equal(null);
      var b = JSON.parse(body);
      expect(b.error).to.be.equal('unauthorized');
      done();
    });
  });

  it('fails on invalid javascript key', done => {
    var headers = {
      'Content-Type': 'application/octet-stream',
      'X-Parse-Application-Id': 'test',
      'X-Parse-Javascript-Key': 'notjavascript'
    };
    request.get({
      headers: headers,
      url: 'http://localhost:8378/1/classes/TestObject'
    }, (error, response, body) => {
      expect(error).to.be.equal(null);
      var b = JSON.parse(body);
      expect(b.error).to.be.equal('unauthorized');
      done();
    });
  });

  it('fails on invalid rest api key', done => {
    var headers = {
      'Content-Type': 'application/octet-stream',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'notrest'
    };
    request.get({
      headers: headers,
      url: 'http://localhost:8378/1/classes/TestObject'
    }, (error, response, body) => {
      expect(error).to.be.equal(null);
      var b = JSON.parse(body);
      expect(b.error).to.be.equal('unauthorized');
      done();
    });
  });

});
