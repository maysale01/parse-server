#!/usr/bin/env babel-node

import Jasmine from 'jasmine'

var jasmine = new Jasmine()
jasmine.loadConfigFile('spec/support/jasmine.json')
jasmine.configureDefaultReporter({
    showColors: true
})
jasmine.execute()