'use strict';

angular.module('lorryApp').controller('DocumentCtrl', ['$rootScope', '$scope', '$log', 'lodash', 'jsyaml', 'ngDialog', 'yamlValidator', 'serviceDefTransformer',
  function ($rootScope, $scope, $log, lodash, jsyaml, ngDialog, yamlValidator, serviceDefTransformer) {

    var self = this;

    $scope.yamlDocument = {};
    $scope.resettable = false;
    $scope.importable = true;
    $scope.editedServiceYamlDocumentJson = {};
    $rootScope.serviceNameList = [];
    $rootScope.markAsDeletedTracker = {};

    $scope.hasErrors = function () {
      return lodash.any($scope.yamlDocument.errors);
    };

    $scope.resetWorkspace = function () {

      $scope.confirmMessage = 'Are you sure you want to clear the workspace?';
      ngDialog.openConfirm(
        {
          template: '/views/confirm-dialog.html',
          className: 'ngconfirm-theme-lorry',
          showClose: false,
          scope: $scope
        }
      ).then(function () {
          self.reset();
        });
    };

    $scope.deleteService = function (serviceName) {
      if ($scope.yamlDocument.json.hasOwnProperty(serviceName)) {
        delete $scope.yamlDocument.json[serviceName];
        self.validateJson();
      }
    };

    $scope.$watchCollection('yamlDocument.raw', function() {
      var documentDefined = (angular.isDefined($scope.yamlDocument) && angular.isDefined($scope.yamlDocument.raw));
      if (documentDefined) { self.failFastOrValidateYaml(); }
      $scope.resettable = documentDefined;
      $scope.importable = !documentDefined;
    });

    this.reset = function () {
      $scope.yamlDocument = {};
      this.buildServiceDefinitions();
    };

    this.validateJson = function () {
      if(lodash.isEmpty($scope.yamlDocument.json)) {
        this.reset();
      } else {
        $scope.yamlDocument.parseErrors = false;
        $scope.yamlDocument.loadFailure = false;
        $scope.yamlDocument.raw = jsyaml.safeDump($scope.yamlDocument.json);
      }
    };

    this.failFastOrValidateYaml = function () {
      var yaml = $scope.yamlDocument.raw;

      try {
        $scope.yamlDocument.json = jsyaml.safeLoad(yaml);
        self.validateYaml();
      } catch(YamlException) {
        // if jsyaml can't load the document, don't bother calling the server
        $scope.yamlDocument.errors = [{error: {message: YamlException.message}}];
        $scope.yamlDocument.parseErrors = false;
        $scope.yamlDocument.loadFailure = true;
      }
    };

    this.validateYaml = function() {
      var yaml = $scope.yamlDocument.raw;

      yamlValidator.validate(yaml)
        .then(function (response) {
          $scope.yamlDocument.lines = response.data.lines;
          $scope.yamlDocument.errors = response.data.errors;
          if (lodash.any(response.data.errors)) {
            $scope.yamlDocument.parseErrors = true;
            $scope.yamlDocument.loadFailure = false;
          }
        })
        .catch(function (response) {
          if (response.status === 422 && response.data) {
            $scope.yamlDocument.lines = response.data.lines;
            $scope.yamlDocument.errors = [{error: {message: response.data.error}}];
          } else {
            $scope.yamlDocument.errors = [{error: {message: 'An internal server error has occurred'}}];
          }
          $scope.yamlDocument.parseErrors = false;
          $scope.yamlDocument.loadFailure = true;
        })
        .finally(function () {
          self.buildServiceDefinitions();
          $rootScope.serviceNameList = $scope.serviceNames();
        }
      );
    };

    this.buildServiceDefinitions = function () {
      $scope.serviceDefinitions = serviceDefTransformer.fromYamlDocument($scope.yamlDocument);
    };

    $scope.serviceName = function (srvcDef) {
      return srvcDef[0].text.split(':')[0];
    };

    $scope.editService = function (serviceName) {
      if ($scope.yamlDocument.json.hasOwnProperty(serviceName)) {
        // copy the service json for editing purposes
        $scope.editedServiceYamlDocumentJson = lodash.cloneDeep($scope.yamlDocument.json[serviceName]);

        // turn on edit mode
        $scope.yamlDocument.json[serviceName].editMode = true;

        // since image/build section is mandatory, add it to the json if not present
        if (!lodash.has($scope.editedServiceYamlDocumentJson, 'image') &&
            !lodash.has($scope.editedServiceYamlDocumentJson, 'build')) {
          $scope.editedServiceYamlDocumentJson['image'] = 'image or build is required';
        }
      }
    };

    $scope.$on('saveService', function (e, oldServiceName, newServiceName, updatedSectionData) {
      // Delete the markedForDeletion items
      updatedSectionData = self.deleteItemsMarkedForDeletion(updatedSectionData);

      // Update the json for the service name
      if (oldServiceName != newServiceName) {
        delete $scope.yamlDocument.json[oldServiceName];
      }
      $scope.yamlDocument.json[newServiceName] = updatedSectionData;
      delete $scope.yamlDocument.json[newServiceName].editMode;

      self.validateJson();
    });

    $scope.$on('cancelEditing', function (e, serviceName) {
      // reset the delete tracker
      $rootScope.markAsDeletedTracker = {};

      // turn off edit mode
      delete $scope.yamlDocument.json[serviceName].editMode;
    });

    this.deleteItemsMarkedForDeletion = function(data) {
      var tracker = $rootScope.markAsDeletedTracker;

      angular.forEach(tracker, function(v, k) {
        if (v[0] === 'delete me') {
          delete data[k];
        } else {
          lodash.pullAt(data[k], v);
          // delete key if no items are left
          if (lodash.size(data[k]) == 0) {
            delete data[k];
          }
        }
      });

      // reset the tracker
      $rootScope.markAsDeletedTracker = {};

      return data;
    };

    $scope.serviceNames = function () {
      return lodash.keys($scope.yamlDocument.json);
    };

    $scope.inEditMode = function () {
      return lodash.some($scope.yamlDocument.json, 'editMode', true);
    };

  }]);
