var assert = require('assert');
var mockery = require('mockery');
var sinon = require('sinon');

var PodcastView; // Subject of the test

var dynamoStub = {
  getItem: sinon.stub()
};

describe('PodcastView', function() {
  before(function() {
    mockery.enable();
  });

  beforeEach(function() {
    mockery.registerAllowable('underscore');
    mockery.registerMock('dynamodb-doc', { DynamoDB: function() { return dynamoStub } });
    mockery.registerAllowable('../lib/PodcastView', true);

    PodcastView = require('../lib/PodcastView');

  });

  it('calls the callback with a view when findById is called with a valid viewId', function() {
    // Setup stubs
    dynamoStub
      .getItem
      .withArgs({
        TableName: 'podcast-views',
        Key: { feedId: '123', viewId: '456' }
      })
      .callsArgWith(1, null, {
        Item: {
          feedId: '123',
          viewId: '456',
          name: 'Test View',
          template: 'Hello World'
        }
      });

    var callback = sinon.spy();

    // Call findById
    PodcastView.findById({ feedId: '123', viewId: '456' }, callback);

    // Assertions
    assert(callback.calledOnce);

    var error = callback.getCall(0).args[0];
    var view = callback.getCall(0).args[1];
    assert.equal(error, null);
    assert.equal(view.feedId, '123');
    assert.equal(view.viewId, '456');
    assert.equal(view.name, 'Test View');
    assert.equal(view.template, 'Hello World');
  });

  after(function() {
    mockery.deregisterAll();
    mockery.disable();
  });
});
