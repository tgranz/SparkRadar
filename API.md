# Global scoped objects

Within SparkRadar, several functions and objects are assigned to the global scope for access within all modules. These are utilities added to make the coding flow easy. Access one with `window.object` or `window.object()` where "object" is one of the objects below.

<br><br>

## Instances

### settingsInstance
> settings.js class object.

### locationServices
> location_services.js class object.

### globalPalettes
> palettes.js class object.

### mapInstance
> map.js class object.

### radarInstance
> radar.js class object.

### radarCache
> radar_cache.js class object.

### animationController
> radar_animation.js class object.

### spotterNetworkInstance
> spotter_network.js class object.

<br><br>

## Application Data / Features
### radarStationFeatures
> GeoJSON featureset of the radar stations on the map.

### cache
> global layer cache?

<br><br>

## States
### appmode
> String, 'satellite' or 'radar' depending on the mode chosen in the application menu.

<br><br>

## Functions
### setToolEnabled({button}, {enabled})
> Sets a toolbar/toolbox button to be enabled functionally and visually; where {button} is either the HTML ID string or a button HTMLElement, and {enabled} is true or false.

### enableTool({button}) and disableTool({button})
> Shorthand wrappers for setToolEnabled; where {button} is either the HTML ID string or a button HTMLElement.

### enableAutoUpdates()
> Enables the auto update interval.

### disableAutoUpdates()
> Disables the auto update interval.

### isAutoUpdateEnabled()
> Returns true if the auto update interval is enabled, otherwise returns false.