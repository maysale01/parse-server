"use strict";
require("babel-polyfill");
// These tests check that the Schema operates correctly.

import { Schema, Config } from '../../src/classes';

describe('Schema', () => {

    let schema;

    // Setup the config for each test
    beforeEach(async (done) => {
        const cache = Server.getCacheProvider().getCache();
        const app = await cache.getApp('test', 'test_');

        const config = new Config({
            app: app
        });

        schema = await config.database.loadSchema();

        done();
    });


  it('can validate one object', async (done) => {
    try {
        // Validate the object
        await schema.validateObject('TestObject', {a: 1, b: 'yo', c: false});
        done();
    }
    catch (error) {
        fail(error);
    }
  });

  it('can validate two objects in a row', async (done) => {

    try {
        // Validate 2 objects
        await schema.validateObject('Foo', {x: true, y: 'yyy', z: 0});
        await schema.validateObject('Foo', {x: false, y: 'YY', z: 1});
        done();
    }
    catch (error) {
        fail(error);
    }
  });

  it('rejects inconsistent types', async (done) => {
    try {
        // Attempt to validate 2 different types for the same property
        await schema.validateObject('Stuff', {bacon: 7});
        await schema.validateObject('Stuff', {bacon: 'z'});
        fail('Expected Schema to throw an error');
    }
    catch (error) {
        done();
    }
  });

  it('updates when new fields are added', async (done) => {
    try {
        await schema.validateObject('Stuff', {bacon: 7});
        await schema.validateObject('Stuff', {sausage: 8});
        await schema.validateObject('Stuff', {sausage: 'ate'});
        fail('Expected inconsistent type on new property to throw an error during validation');
    } catch (error) {
        if (error instanceof Parse.Error) {
            done();
        } else {
            fail(error);
        }
    }
  });

  it('class-level permissions test find', async (done) => {
    try {
        // Just to create a valid class
        await schema.validateObject('Stuff', {foo: 'bar'});
        await schema.setPermissions('Stuff', {
            'find': {}
        });
        let results = await (new Parse.Query('Stuff')).find();
        fail('Class permissions should have rejected this query.');
    } catch (error) {
        if (error instanceof Parse.Error) {
            done();
        } else {
            fail(error);
        }
    }
  });

  it('class-level permissions test user', async (done) => {
    try {
        let find = {};
        let user = await createTestUser();
        await schema.validateObject('Stuff', {foo: 'bar'});

        // Set class level permissions for the user we just created
        find[user.id] = true;
        await  schema.setPermissions('Stuff', {
            'find': find
        });

        // Test permissions
        await (new Parse.Query('Stuff')).find();
        done();
    }
    catch (error) {
        fail('Class permissions should have allowed this query.');
    }
  });

  it('class-level permissions test get', async (done) => {
    let find = {};
    let user = await createTestUser();
    let get = {};
    get[user.id] = true;

    await schema.validateObject('Stuff', {foo: 'bar'});
    // Update permissions on the class
    await schema.setPermissions('Stuff', {
        'find': find,
        'get': get
    });

    let obj = new Parse.Object('Stuff');
    obj.set('foo', 'bar');
    obj = await obj.save();

    // Try to find
    try {
        let results = await (new Parse.Query('Stuff')).find();
        fail('Class permissions should have rejected this query.');
    } catch (error) {
        if (error instanceof Parse.Error) {
            // Failed as expected
        } else {
            fail(error);
        }
    }

    // Try to get
    try {
        await (new Parse.Query('Stuff')).get(obj.id);
        done();
    } catch (error) {
        fail('Class permissions should have allowed this get query');
    }
  });
});
