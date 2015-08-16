var assert = require('assert');
var mockery = require('mockery');
var sinon = require('sinon');

var PodcastView; // Subject of the test

var dynamoStub;
var s3Stub;

var view456 = {
  feedId: '123',
  viewId: '456',
  name: 'Test View',
  template: 'Hello World'
};

var view789 = {
  feedId: '123',
  viewId: '789',
  name: 'Test View 2',
  template: 'Goodbye World'
};

var episodes = [
  { title: 'Episode 1' },
  { title: 'Episode 2' },
];

describe('PodcastView', function() {
  before(function() {
    mockery.enable({warnOnUnregistered: false});
  });

  beforeEach(function() {
    mockery.registerAllowable('underscore');

    mockery.registerMock('dynamodb-doc', { DynamoDB: function() { return dynamoStub } });
    dynamoStub = {
      getItem: sinon.stub(),
      query: sinon.stub(),
    };

    mockery.registerMock('aws-sdk', { S3: function() { return s3Stub } });
    s3Stub = {
      putObject: sinon.stub(),
    };

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
        Item: view456
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

  it('calls the callback with each view when forEachView is called', function() {
    // Setup stubs
    dynamoStub
      .query 
      .withArgs(
      {
        TableName: 'podcast-views',
        KeyConditionExpression: "feedId = :feedId",
        ExpressionAttributeValues: {
          ':feedId': '123'
        }
      })
      .callsArgWith(1, null, {
        Items: [view456, view789]
      });

    var callback = sinon.spy();

    // Call findById
    PodcastView.forEachView('123', callback);

    // Assertions
    assert(callback.calledTwice);

    var error = callback.getCall(0).args[0];
    var view = callback.getCall(0).args[1];
    var last = callback.getCall(0).args[2];
    assert.equal(error, null);
    assert.equal(view.feedId, '123');
    assert.equal(view.viewId, '456');
    assert.equal(view.name, 'Test View');
    assert.equal(view.template, 'Hello World');
    assert(!last);

    var error = callback.getCall(1).args[0];
    var view = callback.getCall(1).args[1];
    var last = callback.getCall(1).args[2];
    assert.equal(error, null);
    assert.equal(view.feedId, '123');
    assert.equal(view.viewId, '789');
    assert.equal(view.name, 'Test View 2');
    assert.equal(view.template, 'Goodbye World');
    assert(last);
  });

  it("calls the callback with each view when forEachView's query is truncated", function() {
    // Setup stubs
    dynamoStub
      .query 
      .withArgs(
      {
        TableName: 'podcast-views',
        KeyConditionExpression: "feedId = :feedId",
        ExpressionAttributeValues: {
          ':feedId': '123'
        }
      })
      .callsArgWith(1, null, {
        Items: [view456],
        LastEvaluatedKey: { feedId: '123', viewId: '456' }
      });
    dynamoStub
      .query 
      .withArgs(
      {
        TableName: 'podcast-views',
        KeyConditionExpression: "feedId = :feedId",
        ExpressionAttributeValues: {
          ':feedId': '123'
        },
        ExclusiveStartKey: { feedId: '123', viewId: '456' },
      })
      .callsArgWith(1, null, {
        Items: [view789],
      });

    var callback = sinon.spy();

    // Call findById
    PodcastView.forEachView('123', callback);

    // Assertions
    assert(callback.calledTwice);

    var error = callback.getCall(0).args[0];
    var view = callback.getCall(0).args[1];
    var last = callback.getCall(0).args[2];
    assert.equal(error, null);
    assert.equal(view.feedId, '123');
    assert.equal(view.viewId, '456');
    assert.equal(view.name, 'Test View');
    assert.equal(view.template, 'Hello World');
    assert(!last);

    var error = callback.getCall(1).args[0];
    var view = callback.getCall(1).args[1];
    var last = callback.getCall(1).args[2];
    assert.equal(error, null);
    assert.equal(view.feedId, '123');
    assert.equal(view.viewId, '789');
    assert.equal(view.name, 'Test View 2');
    assert.equal(view.template, 'Goodbye World');
    assert(last);
  });

  it('uploads an artifact when render is called', function() {
    // Setup the test.
    s3Stub.putObject.onFirstCall().callsArgWith(1, null);

    var view = new PodcastView({
      bucket: 'test-bucket',
      filenameTemplate: 'episodes.html',
      template: '<% _.each(episodes, function(episode) { %><h1><%= episode.title %></h1><% }); %>',
    });

    var callback = sinon.stub();

    // Render
    view.render(episodes, callback);

    // Verify the correct artifact was rendered.
    assert(s3Stub.putObject.calledOnce);
    var params = s3Stub.putObject.getCall(0).args[0];
    assert.equal(params.Bucket, 'test-bucket');
    assert.equal(params.Key, 'episodes.html');
    assert.equal(params.Body, '<h1>Episode 1</h1><h1>Episode 2</h1>');

    // Verify the callback was called.
    assert(callback.calledOnce);
  });

  it('uploads multiple artifacts when render is called and renderEach is true', function() {
    // Setup the test.
    s3Stub.putObject.onFirstCall().callsArgWith(1, null);
    s3Stub.putObject.onSecondCall().callsArgWith(1, null);

    var view = new PodcastView({
      bucket: 'test-bucket',
      filenameTemplate: '<%= episode.title.toLowerCase().replace(/[^\w ]+/g,'').replace(/ +/g,'-') %>.html',
      template: '<h1><%= episode.title %></h1>',
      renderEach: true,
    });

    var callback = sinon.stub();

    // Render
    view.render(episodes, callback);

    // Verify the correct artifact was rendered.
    assert.equal(s3Stub.putObject.callCount, 2);

    var params = s3Stub.putObject.getCall(0).args[0];
    assert.equal(params.Bucket, 'test-bucket');
    assert.equal(params.Key, 'episode-1.html');
    assert.equal(params.Body, '<h1>Episode 1</h1>');

    var params = s3Stub.putObject.getCall(1).args[0];
    assert.equal(params.Bucket, 'test-bucket');
    assert.equal(params.Key, 'episode-2.html');
    assert.equal(params.Body, '<h1>Episode 2</h1>');

    // Verify the callback was called.
    assert(callback.calledOnce);
  });

  afterEach(function() {
    mockery.deregisterAll();
  }),

  after(function() {
    mockery.disable();
  });
});
