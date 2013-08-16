'use strict';

/**
 * Testing library: runner for tests.
 * (C) 2013 Alex Fernández.
 */


// requires
var Log = require('log');
var util = require('util');

// globals
var log = new Log('info');
var errors = 0;

// constants
var GREEN = '\u001b[32m';
var RED = '\u001b[1;31m';
var PURPLE = '\u001b[1;35m';
var BLACK = '\u001b[0m';
var SUCCESS_START = GREEN + '✓ ';
var END = BLACK;
var FAILURE_START = RED + '✕ ';
var UNKNOWN_START = PURPLE + '? ';
var INVALID_START = PURPLE + '??? ';
var SEPARATOR = ': ';


/**
 * A test result.
 */
var TestResult = function(key)
{
	// self-reference
	var self = this;

	// attributes
	self.key = key;
	self.success = false;
	self.failure = false;
	self.message = null;
	
	/**
	 * Callback for the test result.
	 * Can only be called once.
	 */
	self.callback = function(error, result)
	{
		if (error)
		{
			// only report the first failure
			if (!self.failure)
			{
				self.success = false;
				self.failure = true;
				self.message = error;
			}
		}
		else
		{
			if (!self.failure)
			{
				if (self.success)
				{
					// only one success allowed
					self.failure = true;
					self.success = false;
					self.message = 'Duplicated call to callback';
				}
				else
				{
					self.success = true;
					self.message = result;
				}
			}
		}
	}

	/**
	 * Return a printable representation.
	 */
	self.toString = function(indent)
	{
		var message = self.key;
		if (self.message)
		{
			message += SEPARATOR + self.message;
		}
		return getPrintable(self, message, indent);
	}
}

/**
 * A result that contains other results.
 */
var CompositeResult = function(key)
{
	// self-reference
	var self = this;

	// attributes
	self.key = key;
	self.success = false;
	self.failure = false;
	self.results = {};

	/**
	 * Add a sub-result.
	 */
	self.add = function(result)
	{
		self.results[result.key] = result;
		if (result.success && !self.failure)
		{
			self.success = true;
		}
		if (result.failure)
		{
			self.success = false;
			self.failure = true;
		}
	}

	/**
	 * Return a printable representation.
	 */
	self.toString = function(indent)
	{
		indent = indent || 0;
		var message = getPrintable(self, self.key + SEPARATOR, indent) + '\n';
		message += getIndented(indent) + '{\n';
		for (var key in self.results)
		{
			var result = self.results[key];
			message += result.toString(indent + 1) + ',\n';
		}
		message += getIndented(indent) + '}';
		return message
	}
}

/**
 * Get the printable representation for a result, like this:
 * START message END.
 * An optional indent is applied as an equivalent number of tabs.
 */
function getPrintable(result, message, indent)
{
	var start;
	if (!result.failure && !result.success)
	{
		start = UNKNOWN_START;
	}
	else if (result.success && result.failure)
	{
		start = INVALID_START;
	}
	else if (result.success)
	{
		start = SUCCESS_START;
	}
	else
	{
		start = FAILURE_START;
	}
	return getIndented(indent) + start + message + END;
}

/**
 * Get an indented string, with an equivalent number of tabs.
 */
function getIndented(indent)
{
	var indented = '';
	if (indent)
	{
		for (var i = 0; i < indent; i++)
		{
			indented += '\t';
		}
	}
	return indented;
}

/**
 * Run a series of functions sequentially. Parameters:
 *	- param: an indexed object with functions, or with nested indexed objects.
 *	- callback: a function(error, result) to pass an indexed object with the results.
 */
exports.run = function(param, callback)
{
	var series = clone(param);
	var testResult = new CompositeResult('success');
	runOne(series, testResult, function(error, result)
	{
		if (testResult.failure)
		{
			testResult.key = 'failure';
		}
		callback(error, result);
	});
}

/**
 * Run one function in the series, go to the next.
 */
function runOne(series, testResult, callback)
{
	if (isEmpty(series))
	{
		return callback(null, testResult);
	}
	for (var key in series)
	{
		var value = series[key];
		if (typeof value == 'object')
		{
			var subResult = new CompositeResult(key);
			runOne(value, subResult, function(error, result)
			{
				if (error)
				{
					log.error('Could not run all functions');
					return;
				}
				testResult.add(subResult);
				deleteAndRunNext(key, series, testResult, callback);
			});
		}
		else if (typeof value == 'function')
		{
			var subResult = new TestResult(key);
			// it is a function to run
			value(function(error, result)
			{
				subResult.callback(error, result);
				testResult.add(subResult);
				deleteAndRunNext(key, series, testResult, callback);
			});
		}
		else
		{
			log.error('Invalid value %s', value);
			testResult.callback('Key %s has an invalid value %s');
			deleteAndRunNext(key, series, testResult, callback);
		}
		// only the first element in series is used;
		// the rest are called by recursion in deleteAndRunNext()
		return;
	}
}

/**
 * Delete the current function, run the next.
 */
function deleteAndRunNext(key, series, testResult, callback)
{
	if (!(key in series))
	{
		// already run
		return;
	}
	delete series[key];
	return process.nextTick(function()
	{
		runOne(series, testResult, callback);
	});
}

/**
 * Test to run some functions.
 */
function testRun()
{
	var series = {
		a: function(callback) {
			callback(null, 'a');
		},
		b: {
			e: function(callback) {
				callback('e');
			},
			c: function(callback) {
				callback(null, 'c');
			},
		},
	};
	exports.run(series, function(error, result)
	{
		console.assert(result.failure, 'Root should be failure');
		console.assert(result.results.a, 'Should have result for a');
		console.assert(result.results.a.success, 'Should have success for a');
		console.assert(result.results.a.message == 'a', 'Should have an a for a');
		console.assert(result.results.b, 'Should have result for b');
		console.assert(result.results.b.failure, 'Should have failure for b');
		console.assert(result.results.b.results.c, 'Should have result for b.c');
		console.assert(result.results.b.results.c.success, 'Should have success for b.c');
		console.assert(result.results.b.results.c.message == 'c', 'Should have a c for b.c');
		console.assert(result.results.b.results.e, 'Should have result for b.e');
		console.assert(result.results.b.results.e.failure, 'Should have failure for b.e');
		console.assert(result.results.b.results.e.message == 'e', 'Should have a e for b.e');
		log.info('Test run successful: %s', result);
	});
}

/**
 * Clone a series of functions. Performs a sanity check.
 */
function clone(series)
{
	if (typeof series != 'object')
	{
		log.error('Invalid series %s', JSON.stringify(series));
		return;
	}
	var copy = {};
	for (var key in series)
	{
		var value = series[key];
		if (typeof value == 'function')
		{
			copy[key] = value;
		}
		else
		{
			copy[key] = clone(value);
		}
	}
	return copy;
}

/**
 * Test the clone function.
 */
function testClone()
{
	var original = {
		a: function(parameter) {},
		b: {
			c: function(parameter) {},
		},
	};
	var cloned = clone(original);
	console.assert(cloned.a, 'Cloned object should have function property');
	console.assert(typeof cloned.a == 'function', 'Cloned object should have function');
	console.assert(cloned.b, 'Cloned object should have object property');
	console.assert(typeof cloned.b == 'object', 'Cloned object should have object');
	console.assert(cloned.b.c, 'Cloned object should have sub-object property');
	console.assert(typeof cloned.b.c == 'function', 'Cloned object should have sub-object');
}

/**
 * Find out if the object is empty.
 */
function isEmpty(object)
{
	for (var key in object)
	{
		if (object[key])
		{
			return false;
		}
	}
	return true;
}

/**
 * Test the empty function.
 */
function testEmpty()
{
	console.assert(isEmpty({}), 'Empty should be empty');
	console.assert(!isEmpty({a: 'a'}), 'Not empty is empty');
}

/**
 * Run all module tests.
 * Cannot use testing since it is not defined yet.
 */
function test()
{
	testEmpty();
	testClone();
	testRun();
}

// run tests if invoked directly
if (__filename == process.argv[1])
{
	test();
}
