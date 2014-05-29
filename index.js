// __Dependencies__
var mongoose = require('mongoose');
var baucis = require('baucis');

var Controller = baucis.Controller;

// __Module Definition__
var decorator = module.exports = function (options, protect) {
  var controller = this;

  protect.property('parentController');
  protect.property('parentPath');

  // TODO set "up" link relation to link to parent

  protect.property('children', [], function (child) {
    var children = this.children();
    if (!child) {
      throw baucis.Error.Configuration('A child controller must be supplied when using the children poperty');
    }
    if (children.indexOf(child) !== -1) {
      throw baucis.Error.Configuration('A controller was added as a child to the same parent contorller twice');
    }
    if (!child.parentPath()) child.parentPath(controller.model().singular());
    
    controller.use('/:parentId/:path', function (request, response, next) {
      var fragment = '/' + request.params.path;
      var parentConditions = {};
      if (fragment !== child.fragment()) return next(); 

      request.baucis.parentId = request.params.parentId;
      parentConditions[controller.findBy()] = request.params.parentId;

      controller.model().findOne(parentConditions, function (error, parent) {
        if (error) return next(error);
        if (!parent) {
          error = baucis.Error.NotFound();
          error.parentController = true;
          next(error);
          return;
        };
        child(request, response, next);
      });
    });

    child.parentController(controller);
    return children.concat(child);
  });

  controller.vivify = function (path) {
    var definition = controller.model().schema.path(path);
    var ref = definition.caster.options.ref;

    if (definition.caster.instance !== 'ObjectID') {
      throw baucis.Error.Configuration('Only paths with a type of ObjectId can be vivified');
    }
    if (!ref) {
      throw baucis.Error.Configuration('Only paths that reference another collection can be vivified');
    }

    var child = baucis.Controller(ref).fragment(path);

    child.request('post', function (request, response, next) {
      request.baucis.incoming(function (context, callback) {
        var path = child.parentPath();
        if (!context.incoming[path]) context.incoming[path] = request.baucis.parentId;
        callback(null, context);
      });
      next();
    });

    child.query(function (request, response, next) {
      var conditions = {};
      conditions[child.parentPath()] = request.baucis.parentId;
      request.baucis.query.where(conditions);
      next();
    });

    controller.children(child);

    return child;
  };

  // Middleware to validate parent ID.
  controller.request(function (request, response, next) {
    var id = request.params.parentId;
    if (!controller.parentController()) return next();
    var instance = controller.parentController().model().schema.path(controller.findBy()).instance;
    var invalid = protect.isInvalid(id, instance, 'url.parentId');
    var error;

    if (!invalid) return next();

    error = baucis.Error.ValidationError('The requested document ID "%s" is not a valid document ID', id);
    error.errors = { parentId: invalid };
    next(error);
  });
};

baucis.Controller.decorators(decorator);
