var MapModule = require("./map_module");
var indoors = require("../public/indoors/indoors");
var IndoorWatermarkController = require("./indoor_watermark_controller");

var IndoorsModule = function(emscriptenApi, mapController, mapId) {

    var _emscriptenApi = emscriptenApi;
    var _mapController = mapController;

    var _activeIndoorMap = null;
    var _entrances = {};

    var _ready = false;
    var _pendingEnterTransition = null;
    var _transitioningToIndoorMap = false;

    var _indoorWatermarkController = new IndoorWatermarkController(mapId);

    var _this = this;

    var _createIndoorMapObject = function() {
        var mapId = _emscriptenApi.indoorsApi.getActiveIndoorMapId();
        var mapName = _emscriptenApi.indoorsApi.getActiveIndoorMapName();
        var sourceVendor = _emscriptenApi.indoorsApi.getActiveIndoorMapSourceVendor();
        var floorCount = _emscriptenApi.indoorsApi.getActiveIndoorMapFloorCount();
        var floors = _createFloorsArray(floorCount);
        var searchTags = _createSearchTagsArray();
        var exitFunc = _this.exit;
        var indoorMap = new indoors.IndoorMap(mapId, mapName, sourceVendor, floorCount, floors, searchTags, exitFunc);
        return indoorMap;
    };

    var _createFloorsArray = function(floorCount) {
        var floors = [];
        for (var i=0; i<floorCount; ++i) {
            var floorIndex = i;
            var floorName = _emscriptenApi.indoorsApi.getFloorName(i);
            var floorShortName = _emscriptenApi.indoorsApi.getFloorId(i);
            var floorId = floorShortName;
            var floor = new indoors.IndoorMapFloor(floorId, floorIndex, floorName, floorShortName);
            floors.push(floor);
        }
        return floors;
    };

    var _createSearchTagsArray = function() {
        var userData;
        try {
            userData = JSON.parse(_emscriptenApi.indoorsApi.getActiveIndoorMapUserData());
        }
        catch (e) {
            return [];
        }
        
        if (typeof userData.search_menu_items !== "object") { return []; }
        if (!(userData.search_menu_items.items instanceof Array)) { return []; }

        var searchTags = [];
        userData.search_menu_items.items.forEach(function(item) {
            searchTags.push({
                name: item.name,
                search_tag: item.search_tag,
                icon_key: item.icon_key
            });
        });
        return searchTags;
    };

    var _executeIndoorMapEnteredCallbacks = function() {
        _activeIndoorMap = _createIndoorMapObject();
        _this.fire("indoormapenter", {indoorMap: _activeIndoorMap});
    };

    var _executeIndoorMapExitedCallbacks = function() {
        var indoorMap = _activeIndoorMap;
        _activeIndoorMap = null;
        _this.fire("indoormapexit", {indoorMap: indoorMap});
    };
    
    var _executeIndoorMapFloorChangedCallbacks = function() {
        _this.fire("indoormapfloorchange", {floor: _this.getFloor()});
    };

    var _executeIndoorMapEntranceAddedCallbacks = function(indoorMapId, indoorMapName, indoorMapLatLng) {
        var entrance = new indoors.IndoorMapEntrance(indoorMapId, indoorMapName, indoorMapLatLng);
        _entrances[entrance.getIndoorMapId()] = entrance;
        _this.fire("indoorentranceadd", {entrance: entrance});
    };

    var _executeIndoorMapEntranceRemovedCallbacks = function(indoorMapId, indoorMapName, indoorMapLatLng) {
        var entrance = new indoors.IndoorMapEntrance(indoorMapId, indoorMapName, indoorMapLatLng);
        delete _entrances[entrance.getIndoorMapId()];
        _this.fire("indoorentranceremove", {entrance: entrance});
    };

    var _onCollapseStart = function() {
        _this.fire("collapsestart");
    };

    var _onCollapse = function() {
        _this.fire("collapse");
    };

    var _onCollapseEnd = function() {
        _this.fire("collapseend");
    };

    var _onExpandStart = function() {
        _this.fire("expandstart");
    };

    var _onExpand = function() {
        _this.fire("expand");
    };

    var _onExpandEnd = function() {
        _this.fire("expandend");
    };

    var _enterIndoorMap = function(indoorMapId) {
        _emscriptenApi.indoorsApi.enterIndoorMap(indoorMapId);
    };

    var _transitionToIndoorMap = function(config) {

        _transitioningToIndoorMap = true;

        if (!_ready) {
            _pendingEnterTransition = config;
            return;
        }

        _emscriptenApi.cameraApi.setView({location: config.latLng, distance: config.distance, allowInterruption: false, headingDegrees: 0});
        _mapController._setIndoorTransitionCompleteEventListener(function() { _enterIndoorMap(config.indoorMapId); });

        _this.once("indoormapenter", function() {
            _transitioningToIndoorMap = false;
            var vendorKey = _activeIndoorMap.getIndoorMapSourceVendor();
            _indoorWatermarkController.showWatermarkForVendor(vendorKey);
        });
    };

    this.onInitialized = function() {
        _emscriptenApi.indoorsApi.registerIndoorMapEnteredCallback(_executeIndoorMapEnteredCallbacks);
        _emscriptenApi.indoorsApi.registerIndoorMapExitedCallback(_executeIndoorMapExitedCallbacks);
        _emscriptenApi.indoorsApi.registerIndoorMapFloorChangedCallback(_executeIndoorMapFloorChangedCallbacks);
        _emscriptenApi.indoorsApi.registerIndoorMapMarkerAddedCallback(_executeIndoorMapEntranceAddedCallbacks);
        _emscriptenApi.indoorsApi.registerIndoorMapMarkerRemovedCallback(_executeIndoorMapEntranceRemovedCallbacks);

        _emscriptenApi.expandFloorsApi.setCollapseStartCallback(_onCollapseStart);
        _emscriptenApi.expandFloorsApi.setCollapseCallback(_onCollapse);
        _emscriptenApi.expandFloorsApi.setCollapseEndCallback(_onCollapseEnd);
        _emscriptenApi.expandFloorsApi.setExpandStartCallback(_onExpandStart);
        _emscriptenApi.expandFloorsApi.setExpandCallback(_onExpand);
        _emscriptenApi.expandFloorsApi.setExpandEndCallback(_onExpandEnd);
    };

    this.onInitialStreamingCompleted = function() {
        _ready = true;
        if (_pendingEnterTransition !== null) {
            _transitionToIndoorMap(_pendingEnterTransition);
            _pendingEnterTransition = null;
        }
    };
    
    this.exit = function() {
        if (_emscriptenApi.ready()) {
            _emscriptenApi.indoorsApi.exitIndoorMap();
            _indoorWatermarkController.hideWatermark();
        }
        _pendingEnterTransition = null;
        return this;
    };

    this.isIndoors = function() {
        return _activeIndoorMap !== null;
    };

    this.getActiveIndoorMap = function() {
        return _activeIndoorMap;
    };

    this.getFloor = function() {
        if (this.isIndoors()) {
            var index = _emscriptenApi.indoorsApi.getSelectedFloorIndex();
            return _activeIndoorMap.getFloors()[index];
        }
        return null;
    };

    this.setFloor = function(floor) {
        var index = null;
        if (this.isIndoors()) {
            var floors = _activeIndoorMap.getFloors();

            if (typeof floor === "number") {
                index = floor;
            }
            else if (typeof floor === "object") {
                var floorIndex = floors.indexOf(floor);
                index = (floorIndex >= 0) ? floorIndex : null;
            }
            else if (typeof floor === "string") {
                for (var i=0; i<floors.length; ++i) {
                    if (floors[i].getFloorId() === floor) {
                        index = i;
                        break;
                    }
                }
            }
        }
        if (index !== null) {
            return _emscriptenApi.indoorsApi.setSelectedFloorIndex(index);
        }
        return false;
    };

    this.moveUp = function(numberOfFloors) {
        var delta = (typeof numberOfFloors === "undefined") ? 1 : numberOfFloors;
        var thisFloor = this.getFloor();
        if (thisFloor === null) {
            return false;
        }
        return this.setFloor(thisFloor.getFloorIndex() + delta);
    };

    this.moveDown = function(numberOfFloors) {
        var delta = (typeof numberOfFloors === "undefined") ? -1 : -numberOfFloors;
        return this.moveUp(delta);
    };

    this.enter = function(indoorMap) {
        if (this.isIndoors() || _transitioningToIndoorMap) {
            return false;
        }

        var indoorMapId = null;
        if (typeof indoorMap === "object" && "getIndoorMapId" in indoorMap && typeof indoorMap["getIndoorMapId"] === "function") {
            indoorMapId = indoorMap.getIndoorMapId();
        }
        else if (typeof indoorMap === "string") {
            indoorMapId = indoorMap;
        }

        var entrance = _entrances[indoorMapId] || null;
        if (entrance === null) {
            return false;
        }

        var latLng = entrance.getLatLng();
        var distance = 400;

        var enterConfig = {
            latLng: latLng,
            distance: distance,
            indoorMapId: indoorMapId
        };

        _transitionToIndoorMap(enterConfig);

        return true;
    };

    this.getFloorInterpolation = function() {
        if (_activeIndoorMap !== null) {
            var floorParam = _emscriptenApi.expandFloorsApi.getFloorParam();
            var normalizedValue = floorParam / _activeIndoorMap.getFloorCount();
            return normalizedValue;
        }
        return 0;
    };

    this.getFloorHeightAboveSeaLevel = function(floorIndex) {
        if (this.isIndoors() && 
            floorIndex >= 0 && 
            floorIndex < _activeIndoorMap.getFloorCount())
        {
            return _emscriptenApi.indoorsApi.getFloorHeightAboveSeaLevel(floorIndex);
        }

        return null;
    };

    this.setFloorInterpolation = function(value) {
        if (_activeIndoorMap !== null) {
            var floorParam = value * _activeIndoorMap.getFloorCount();
            _emscriptenApi.expandFloorsApi.setFloorParam(floorParam);
        }
        return this;
    };

    this.setFloorFromInterpolation = function(interpolationParam) {
        if (_activeIndoorMap === null) {
            return false;
        }
        
        var t = (typeof interpolationParam === "undefined") ? this.getFloorInterpolation() : interpolationParam;
        var floorIndex = Math.round(t * _activeIndoorMap.getFloorCount());
        return this.setFloor(floorIndex);
    };

    this.expand = function() {
        _emscriptenApi.expandFloorsApi.expandIndoorMap();
        return this;
    };

    this.collapse = function() {
        _emscriptenApi.expandFloorsApi.collapseIndoorMap();
        return this;
    };

    this.setEntityHighlights = function(ids, color) {
        if (!_ready) return;
        _emscriptenApi.highlightApi.setEntityHighlights(ids, color);
    };

    this.clearEntityHighlights = function() {
        if (!_ready) return;
        _emscriptenApi.highlightApi.clearEntityHighlights();
    };

    this.addAreaHighlight = function(id, color) {
        if (!_ready) return;
        _emscriptenApi.highlightApi.addAreaHighlight(id, color);
    };

    this.clearAreaHighlight = function(id) {
        if (!_ready) return;
        _emscriptenApi.highlightApi.clearAreaHighlight(id);
    };
};

var IndoorsPrototype = L.extend({}, MapModule, L.Mixin.Events); 

IndoorsModule.prototype = IndoorsPrototype;

module.exports = IndoorsModule;