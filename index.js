/*** ForecastIO Z-Way HA module *******************************************

Version: 1.00
(c) Maroš Kollár, 2015
-----------------------------------------------------------------------------
Author: Maroš Kollár <maros@k-1.com>
Description:
    This module checks weather updates via forecast.io

******************************************************************************/

function ForecastIO (id, controller) {
    // Call superconstructor first (AutomationModule)
    ForecastIO.super_.call(this, id, controller);
    
    this.apiKey             = undefined;
    this.unitTemperature    = undefined;
    this.unitSystem         = undefined;
    this.timer              = undefined;
    this.url                = undefined;
    this.devices            = {};
}

inherits(ForecastIO, AutomationModule);

_module = ForecastIO;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

ForecastIO.prototype.deviceTypes = ['wind','humidity','barometer'];

ForecastIO.prototype.init = function (config) {
    ForecastIO.super_.prototype.init.call(this, config);

    var self = this;
    
    this.unitTemperature    = config.unitTemperature.toString();
    this.unitSystem         = config.unitSystem.toString();
    this.langFile           = self.controller.loadModuleLang("ForecastIO");
    this.url                = 'http://api.forecast.io/'
        + 'forecast/'
        + config.apiKey.toString()
        + '/'
        + config.latitude.toString()
        + ','
        + config.longitude.toString();
    
    _.each(self.deviceTypes,function(deviceType) {
        var key = deviceType+'_device';
        self[deviceType+'Device'] = (typeof(self.config[key]) === 'undefined' ? true:self.config[key]);
    });

    self.addDevice('current',{
        probeTitle: 'weather_current',
        scaleTitle: config.unitTemperature === "celsius" ? '°C' : '°F',
        title: self.langFile.current,
        timestamp: 0
    });
    
    self.addDevice('forecast',{
        probeTitle: 'weather_forecast',
        scaleTitle: config.unitTemperature === "celsius" ? '°C' : '°F',
        title: self.langFile.forecast
    });
    
    if (self.humidityDevice) {
        self.addDevice('humidity',{
            probeTitle: 'humidity',
            icon: '/ZAutomation/api/v1/load/modulemedia/ForecastIO/humidity.png',
            scaleTitle: '%',
            title: self.langFile.humidity
        });
    }
    
    if (self.windDevice) {
        self.addDevice('wind',{
            probeTitle: 'wind',
            scaleTitle: config.unitSystem === "metric" ? 'km/h' : 'mph',
            title: self.langFile.wind
        });
    }
    
    if (self.barometerDevice) {
        self.addDevice('barometer',{
            probeTitle: 'barometer',
            scaleTitle: config.unitSystem === "metric" ? 'hPa' : 'inHg',
            icon: '/ZAutomation/api/v1/load/modulemedia/ForecastIO/barometer.png',
            title: self.langFile.barometer
        });
    }
     
    
    var currentTime     = (new Date()).getTime();
    var currentLevel    = self.devices['current'].get('metrics:level');
    var updateTime      = self.devices['current'].get('metrics:timestamp');
    var intervalTime    = parseInt(self.config.interval) * 60 * 1000;
    
    self.timer = setInterval(function() {
        self.fetchWeather(self);
    }, intervalTime);
    
    console.log('[ForecastIO] Last update time '+updateTime);
    if ((updateTime + intervalTime / 3) < currentTime) {
        self.fetchWeather(self);
    }
};

ForecastIO.prototype.stop = function() {
    var self = this;
    
    if (self.timer) {
        clearInterval(self.timer);
        self.timer = undefined;
    }
    
    if (typeof(self.devices) !== 'undefined') {
        _.each(self.devices,function(value, key) {
            self.controller.devices.remove(value.id);
        });
        self.devices = {};
    }
    
    ForecastIO.super_.prototype.stop.call(this);
};

ForecastIO.prototype.addDevice = function(prefix,defaults) {
    var self = this;
    
    var deviceParams = {
        overlay: { deviceType: "sensorMultilevel" },
        defaults: {
            metrics: defaults
        },
        deviceId: "ForecastIO_"+prefix+"_" + this.id,
        moduleId: prefix+"_"+this.id
    };
    
    self.devices[prefix] = self.controller.devices.create(deviceParams);
    return self.devices[prefix];
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

ForecastIO.prototype.fetchWeather = function () {
    var self = this;
    
    http.request({
        url: self.url,
        async: true,
        success: function(response) { self.processResponse(response) },
        error: function(response) {
            console.error("[ForecastIO] Update error");
            console.logJS(response);
            self.controller.addNotification(
                "error", 
                self.langFile.err_fetch, 
                "module", 
                "ForecastIO"
            );
        }
    });
};

ForecastIO.prototype.convertPressure = function(pressureHpa) {
    pressureHpa = parseFloat(pressureHpa);
    if (self.config.unitSystem === "imperial") {
        return pressureHpa;
    } else {
        return  Math.round(pressureHpa / 33.8638866667);
    }
};

ForecastIO.prototype.convertTemp = function(tempF) {
    tempF = parseFloat(tempF);
    if (self.config.unitTemperature === "celsius") {
        return Math.round((tempF -32) * 5 / 9 * 10) / 10;
    } else {
        return tempF;
    }
};

ForecastIO.prototype.convertSpeed = function(speedMs) {
    speedMs = parseFloat(speedMs);
    if (self.config.unitSystem === "metric") {
        return Math.round(speedMs * 60 * 60 / 1000);
    } else {
        return Math.round(speedMs * 60 * 60 / 1609.34);
    }
};

ForecastIO.prototype.processResponse = function(response) {
    console.log("[ForecastIO] Update");
    
    var self        = this;
    
    var currentDate = new Date();
    var current     = response.data.currently;
    
    // Handle current state
    var currentTemperature = self.convertTemp(current.temperature);
    
    self.devices.current.set("metrics:raw",current);
    self.devices.current.set("metrics:icon", "http://icons.wxug.com/i/c/k/"+current.icon+".gif");
    self.devices.current.set("metrics:level",currentTemperature);
    self.devices.current.set("metrics:pop",current.percipProbability * 100);
    self.devices.current.set("metrics:temperature",currentTemperature);
    self.devices.current.set("metrics:weather",current.summary);
    self.devices.current.set("metrics:timestamp",currentDate.getTime());
    self.devices.current.set("metrics:feelslike", self.convertTemp(current.apparentTemperature);
    self.devices.current.set("metrics:ozone",current.ozone);
    self.devices.current.set("metrics:dewpoint",current.dewPoint);
    self.devices.current.set("metrics:percipintensity",current.percipIntensity);
    self.devices.current.set("metrics:cloudcover",current.cloudCover * 100);
    self.devices.current.set("metrics:condition",current.icon); // TODO remove -night
    //self.devices.current.set("metrics:conditiongroup",self.transformCondition(current.icon));
    self.devices.current.set("metrics:high",self.convertTemp(response.data[0].temperatureMax));
    self.devices.current.set("metrics:low",self.convertTemp(response.data[0].temperatureMin);
    
    // Handle forecast
    /*
    self.devices.forecast.set("metrics:conditiongroup",self.transformCondition(forecast[1].icon));
    self.devices.forecast.set("metrics:condition",forecast[1].icon);
    self.devices.forecast.set("metrics:level", forecastLow + ' - ' + forecastHigh);
    self.devices.forecast.set("metrics:icon", "http://icons.wxug.com/i/c/k/"+forecast[1].icon+".gif");
    self.devices.forecast.set("metrics:pop",forecast[1].pop);
    self.devices.forecast.set("metrics:weather",forecast[1].conditions);
    self.devices.forecast.set("metrics:high",forecastHigh);
    self.devices.forecast.set("metrics:low",forecastLow);
    self.devices.forecast.set("metrics:raw",forecast);
     */
    
    // Handle humidity
    if (self.humidityDevice) {
        self.devices.humidity.set("metrics:level", parseInt(current.humidity) * 100);
    }
    
    // Handle wind
    if (self.windDevice) {
        var wind            = parseInt(current.wind);
        var windConverted   = self.convertSpeed(wind);
        var windLevel       = 0;
        if (wind >= 62) { // Beaufort 8
            windLevel = 3;
        } else if (wind >= 39) { // Beaufort 6
            windLevel = 2;
        } else if (wind >= 12) { // Beaufort 3
            windLevel = 1;
        }
        self.devices.wind.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/ForecastIO/wind"+windLevel+".png");
        self.devices.wind.set("metrics:level", windConverted);
        self.devices.wind.set("metrics:wind", windConverted);
        self.devices.wind.set("metrics:winddregrees", parseFloat(current.windBearing));
        self.devices.wind.set("metrics:windlevel",windLevel);
        self.averageSet(self.devices.wind,'wind',windConverted);
    }
    */
    
    // Handle barometer
    if (self.barometerDevice) {
        self.devices.barometer.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/ForecastIO/barometer.png");
        self.devices.barometer.set('metrics:level',self.convertPressure(current.pressure));
    }
};

ForecastIO.prototype.transformCondition = function(condition) {
    if (_.contains(["chanceflurries", "chancesleet", "chancesnow", "flurries","sleet","snow"], condition)) {
        return 'snow';
    } else if (_.contains(["chancetstorms", "chancerain", "rain" ,"tstorms"], condition)) {
        return 'poor';
    } else if (_.contains(["cloudy", "mostlycloudy","fog"], condition)) {
        return 'neutral'
    } else if (_.contains(["clear", "hazy", "mostlysunny", "partlysunny", "partlycloudy"], condition)) {
        return 'fair';
    }
    
    return 'unknown';
};

ForecastIO.prototype.averageSet = function(device,key,value,count) {
    count = count || 3;
    var list = device.get('metrics:'+key+'_list') || [];
    list.unshift(value);
    while (list.length > count) {
        list.pop();
    }
    var sum = _.reduce(list, function(i,j){ return i + j; }, 0);
    var avg = sum / list.length;

    device.set('metrics:'+key+'_list',list);
    device.set('metrics:'+key+'_avg',avg);
    
    return avg;
};


 
