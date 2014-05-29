var mongoose = require('mongoose');
var express = require('express');
var baucis = require('baucis');
var request = require('request');
var expect = require('expect.js');
var plugin = require('.');
var config = require('./config');

var app;
var server;
var Schema = mongoose.Schema;

var User = new Schema({
  name: String,
  tasks: [{ type: Schema.ObjectId, ref: 'task' }]
});

var Task = new Schema({
  name: String,
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
});

var Stores = new Schema({
  name: { type: String, required: true, unique: true },
  tools: [{ type: mongoose.Schema.ObjectId, ref: 'tool' }],
  mercoledi: Boolean,
  voltaic: { type: Boolean, default: true },
  'hyphenated-field-name': { type: Boolean, default: true }
});

var Tools = new Schema({
  name: { type: String, required: true },
  store: { type: String, required: true },
  bogus: { type: Boolean, default: false, required: true }
});

mongoose.model('user', User);
mongoose.model('task', Task);
mongoose.model('tool', Tools);
mongoose.model('store', Stores);

var fixture = {
  init: function (done) {
    mongoose.connect(config.mongo.url);

    // Stores controller
    var stores = baucis.rest('store').findBy('name').select('-hyphenated-field-name -voltaic');

    // Tools embedded controller
    var storeTools = stores.vivify('tools');
    storeTools.query(function (request, response, next) {
      request.baucis.query.where('bogus', false);
      next();
    });

    var users = baucis.rest('user');
    var tasks = users.vivify('tasks');

    tasks.request(function (request, response, next) {
      request.baucis.outgoing(function (context, callback) {
        context.doc.name = 'Changed by Middleware';
        callback(null, context);
      });
      next();
    });

    tasks.query(function (request, response, next) {
      request.baucis.query.where('user', request.params._id);
      next();
    });

    app = express();
    app.use('/api', baucis());
    server = app.listen(8012);

    done();
  },
  deinit: function (done) {
    server.close();
    mongoose.disconnect();
    done();
  },
  create: function (done) {
    // clear all first
    mongoose.model('store').remove({}, function (error) {
      if (error) return done(error);

      mongoose.model('tool').remove({}, function (error) {
        if (error) return done(error);

        mongoose.model('user').remove({}, function (error) {
          if (error) return done(error);

          mongoose.model('task').remove({}, function (error) {
            if (error) return done(error);

            mongoose.model('user').create(
              ['Alice', 'Bob'].map(function (name) { return { name: name } }),
              function (error, alice) {
                if (error) return done(error);

                mongoose.model('task').create(
                  ['Mow the Lawn', 'Make the Bed', 'Darn the Socks'].map(function (name) { return { name: name } }),
                  function (error,task) {
                    if (error) return done(error);
                    task.user = alice._id;
                    task.save();

                    // create stores and tools
                    mongoose.model('store').create(
                      ['Westlake', 'Corner'].map(function (name) { return { name: name } }),
                      function (error, store) {
                        if (error) return done(error);

                        var cheeses = [
                          { name: 'Cheddar', color: 'Yellow' },
                          { name: 'Huntsman', color: 'Yellow, Blue, White' },
                          { name: 'Camembert', color: 'White',
                            arbitrary: [
                              { goat: true, llama: [ 3, 4 ] },
                              { goat: false, llama: [ 1, 2 ] }
                            ]
                          }
                        ];

          	            mongoose.model('tool').create(
          	              ['Hammer', 'Saw', 'Axe'].map(function (name) { return { store: store.name, name: name } }),
          	              done
          	            );
                      }
                    );  
                  }
                );  
              }
            );
          });
        });
      });
    });
  }
};

describe('vivify', function () {

  // __Test Hooks__
  before(fixture.init);
  beforeEach(fixture.create);
  after(fixture.deinit);

  it('should 404 when parent ID is not found', function (done) {
    var options = {
      url: 'http://localhost:8012/api/stores/Lolo/tools?sort=name',
      json: true
    };
    request.get(options, function (error, response, body) {
      if (error) return done(error);
      expect(response.statusCode).to.be(404);
      expect(body).to.be('Not Found: No document matched the requested query (404).');
      done();
    });
  });

  it('should 204 when restricted query has no results', function (done) {
    var options = {
      url: 'http://localhost:8012/api/stores/Corner/tools?sort=name',
      json: true
    };
    request.get(options, function (error, response, body) {
      if (error) return done(error);
      expect(response.statusCode).to.be(204);
      expect(body).to.be(undefined);
      done();
    });
  });

  it('should 422 when restricted query parent ID is invalid');

  it('should allow mounting of subcontrollers (GET plural)', function (done) {
    var options = {
      url: 'http://localhost:8012/api/stores/Westlake/tools?sort=name',
      json: true
    };
    request.get(options, function (error, response, body) {
      if (error) return done(error);
      expect(response.statusCode).to.be(200);
      expect(body).to.have.property('length', 3);
      done();
    });
  });

  it('should allow mounting of subcontrollers (POST plural)', function (done) {
    var options = {
      url: 'http://localhost:8012/api/stores/Westlake/tools',
      json: { name: 'Reticulating Saw' }
    };
    request.post(options, function (error, response, body) {
      if (error) return done(error);
      expect(response.statusCode).to.be(201);
      expect(body).to.have.property('bogus', false);
      expect(body).to.have.property('store', 'Westlake');
      done();
    });
  });

  it('should allow mounting of subcontrollers (DEL plural)', function (done) {
    var options = {
      url: 'http://localhost:8012/api/stores/Westlake/tools',
      json: true
    };
    request.del(options, function (error, response, body) {
      if (error) return done(error);
      expect(response.statusCode).to.be(200);
      expect(body).to.be(3);
      done();
    });
  });

  it('should allow mounting of subcontrollers (GET singular)', function (done) {
    var options = {
      url: 'http://localhost:8012/api/stores/Westlake/tools?sort=name',
      json: true
    };
    request.get(options, function (error, response, body) {
      if (error) return done(error);
      expect(response.statusCode).to.be(200);
      expect(body).to.have.property('length', 3);
      expect(body[0]).to.have.property('name', 'Axe');

      var id = body[0]._id;
      var options = {
        url: 'http://localhost:8012/api/stores/Westlake/tools/' + id,
        json: true
      };
      request.get(options, function (error, response, body) {
        if (error) return done(error);
        expect(response.statusCode).to.be(200);
        expect(body).to.have.property('name', 'Axe');
        done();
      });
    });
  });

  it('should allow mounting of subcontrollers (PUT singular)', function (done) {
    var options = {
      url: 'http://localhost:8012/api/stores/Westlake/tools',
      json: true
    };
    request.get(options, function (error, response, body) {
      if (error) return done(error);
      expect(response.statusCode).to.be(200);

      var id = body[0]._id;
      var options = {
        url: 'http://localhost:8012/api/stores/Westlake/tools/' + id,
        json: { name: 'Screwdriver' }
      };
      request.put(options, function (error, response, body) {
        if (error) return done(error);
        expect(response.statusCode).to.be(200);
        expect(body).to.have.property('name', 'Screwdriver');
        expect(body).to.have.property('bogus', false);
        done();
      });
    });
  });

  it('should allow mounting of subcontrollers (DEL singular)', function (done) {
    var options = {
      url: 'http://localhost:8012/api/stores/Westlake/tools?sort=name',
      json: true
    };
    request.get(options, function (error, response, body) {
      if (error) return done(error);
      expect(response.statusCode).to.be(200);
      expect(body).to.have.property('length', 3);
      expect(body[0]).to.have.property('name', 'Axe');

      var id = body[0]._id;
      var options = {
        url: 'http://localhost:8012/api/stores/Westlake/tools/' + id,
        json: true
      };
      request.del(options, function (error, response, body) {
        if (error) return done(error);
        expect(response.statusCode).to.be(200);
        expect(body).to.be(1);
        done();
      });
    });
  });

  it('should allow parent to function when mounting subcontrollers (GET plural)', function (done) {
    var options = {
      url: 'http://localhost:8012/api/stores/?sort=name',
      json: true
    };
    request.get(options, function (error, response, body) {
      if (error) return done(error);
      expect(response.statusCode).to.be(200);
      expect(body).to.have.length(2);
      done();
    });
  });

  it('should allow parent to function when mounting subcontrollers (POST plural)', function (done) {
    var options = {
      url: 'http://localhost:8012/api/stores/',
      json: { name: 'Arena' }
    };
    request.post(options, function (error, response, body) {
      if (error) return done(error);
      expect(response.statusCode).to.be(201);
      expect(body).not.to.have.property('bogus');
      done();
    });
  });

  it('should allow parent to function when mounting subcontrollers (DELETE plural)', function (done) {
    var options = {
      url: 'http://localhost:8012/api/stores/',
      json: true
    };
    request.del(options, function (error, response, body) {
      if (error) return done(error);
      expect(response.statusCode).to.be(200);
      expect(body).to.be(2);
      done();
    });
  });

  it('should allow parent to function when mounting subcontrollers (GET singular)', function (done) {
    var options = {
      url: 'http://localhost:8012/api/stores/Westlake',
      json: true
    };
    request.get(options, function (error, response, body) {
      if (error) return done(error);
      expect(response.statusCode).to.be(200);
      expect(body).to.have.property('name', 'Westlake');
      done();
    });
  });

  it('should allow parent to function when mounting subcontrollers (PUT singular)', function (done) {
    var options = {
      url: 'http://localhost:8012/api/stores/Westlake',
      json: { mercoledi: false, __v: 0 }
    };
    request.put(options, function (error, response, body) {
      if (error) return done(error);
      expect(response.statusCode).to.be(200);
      expect(body).to.have.property('mercoledi', false);
      done();
    });
  });

  it('should allow parent to function when mounting subcontrollers (DELETE singular)', function (done) {
    var options = {
      url: 'http://localhost:8012/api/stores/Westlake',
      json: true
    };
    request.del(options, function (error, response, body) {
      if (error) return done(error);
      expect(response.statusCode).to.be(200);
      expect(body).to.be(1);
      done();
    });
  });

  it("should not overwrite parent controller's request property", function (done) {
    var options = {
      url: 'http://localhost:8012/api/users?sort=name',
      json: true
    };
    request.get(options, function (error, response, body) {
      if (error) return done(error);
      expect(response.statusCode).to.be(200);
      expect(body).to.have.property('length', 2);
      expect(body[0]).to.have.property('name', 'Alice');
      done();
    });
  });


  it("should use subcontroller middleware", function (done) {
    var options = {
      url: 'http://localhost:8012/api/users',
      json: true
    };
    request.get(options, function (error, response, body) {
      if (error) return done(error);
      expect(response.statusCode).to.be(200);
      expect(body).to.have.property('length', 2);
      expect(body[0]).to.have.property('name', 'Alice');

      var options = {
        url: 'http://localhost:8012/api/users/' + body[0]._id + "/tasks",
        json: true
      };
      request.get(options, function (error, response, body) {
        if (error) return done(error);
        expect(response.statusCode).to.be(200);
        expect(body[0]).to.have.property('name', 'Changed by Middleware');
        done();
      });

    });
  });
});
