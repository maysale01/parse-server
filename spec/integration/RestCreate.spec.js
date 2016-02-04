"use strict";
require("babel-polyfill");

// These tests check the "create" functionality of the REST API.

import request from 'request';
import { Parse } from 'parse/node';
import { rest } from '../../src/utils';
import { Auth, Config } from '../../src/classes';

let config;

describe('rest create', () => {

    beforeEach(async (done) => {
        const cache = Server.getCacheProvider().getCache();
        const app = await cache.getApp('test', 'test_');
        config = new Config({
            app: app
        });
        done();
    });

  it('handles _id', (done) => {
    rest.create(config, Auth.nobody(config), 'Foo', {})
    .then(() => {
      return DatabaseAdapter.mongoFind('Foo', {});
    }).then((results) => {
      expect(results.length).toEqual(1);
      var obj = results[0];
      expect(typeof obj._id).toEqual('string');
      expect(obj.objectId).toBeUndefined();
      done();
    }).catch((error) => {
        console.error(error);
    });
  });

  it('handles array, object, date', (done) => {
    var obj = {
      array: [1, 2, 3],
      object: {foo: 'bar'},
      date: Parse._encode(new Date()),
    };
    rest.create(config, Auth.nobody(config), 'MyClass', obj)
    .then(() => {
      return DatabaseAdapter.mongoFind('MyClass', {}, {});
    }).then((results) => {
      expect(results.length).toEqual(1);
      var mob = results[0];
      expect(mob.array instanceof Array).toBe(true);
      expect(typeof mob.object).toBe('object');
      expect(mob.date instanceof Date).toBe(true);
      done();
    }).catch((error) => {
        console.error(error);
    });
  });

  it('handles user signup', (done) => {
    var user = {
      username: 'asdf',
      password: 'zxcv',
      foo: 'bar',
    };
    rest.create(config, Auth.nobody(config), '_User', user)
      .then((r) => {
        expect(Object.keys(r.response).length).toEqual(3);
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.sessionToken).toEqual('string');
        done();
      });
  });

  it('test facebook signup and login', (done) => {
    var data = {
      authData: {
        facebook: {
          id: '8675309',
          access_token: 'jenny'
        }
      }
    };
    rest.create(config, Auth.nobody(config), '_User', data)
      .then((r) => {
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.sessionToken).toEqual('string');
        return rest.create(config, Auth.nobody(config), '_User', data);
      }).then((r) => {
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.username).toEqual('string');
        expect(typeof r.response.updatedAt).toEqual('string');
        done();
      });
  });

  it('stores pointers with a _p_ prefix', (done) => {
    var obj = {
      foo: 'bar',
      aPointer: {
        __type: 'Pointer',
        className: 'JustThePointer',
        objectId: 'qwerty'
      }
    };
    rest.create(config, Auth.nobody(config), 'APointerDarkly', obj)
      .then((r) => {
        return DatabaseAdapter.mongoFind('APointerDarkly', {});
      }).then((results) => {
        expect(results.length).toEqual(1);
        var output = results[0];
        expect(typeof output._id).toEqual('string');
        expect(typeof output._p_aPointer).toEqual('string');
        expect(output._p_aPointer).toEqual('JustThePointer$qwerty');
        expect(output.aPointer).toBeUndefined();
        done();
      });
  });

  it("cannot set objectId", (done) => {
    var headers = {
      'Content-Type': 'application/octet-stream',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest'
    };
    request.post({
      headers: headers,
      url: 'http://localhost:8378/1/classes/TestObject',
      body: JSON.stringify({
        'foo': 'bar',
        'objectId': 'hello'
      })
    }, (error, response, body) => {
      var b = JSON.parse(body);
      expect(b.code).toEqual(105);
      expect(b.error).toEqual('objectId is an invalid field name.');
      done();
    });
  });

});
