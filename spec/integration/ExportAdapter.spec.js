"use strict";
require("babel-polyfill");

import { ExportAdapter } from '../../src/adapters';

describe('ExportAdapter', () => {
  it('can be constructed', (done) => {
    var database = new ExportAdapter('mongodb://localhost:27017/test',
    	{
    		collectionPrefix: 'test_'
    	});
    database.connect().then(done, (error) => {
      console.log('error', error.stack);
      fail();
    });
  });

});
