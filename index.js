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
ForecastIO.prototype.windBeaufort = [
    0.3,    // 0
    1.5,
    3.3,
    5.5,
    8,
    10.8,
    13.9,   // 6
    17.2,
    20.7,
    24.5,
    28.4,
    32.6,
    Number.POSITIVE_INFINITY
];
ForecastIO.prototype.windIcons = [
    1,
    4,
    7,
    Number.POSITIVE_INFINITY
];

ForecastIO.prototype.init = function (config) {
    ForecastIO.super_.prototype.init.call(this, config);

    var self = this;
    
    this.unitTemperature    = config.unitTemperature.toString();
    this.unitSystem         = config.unitSystem.toString();
    this.langFile           = self.controller.loadModuleLang("ForecastIO");
    this.url                = 'https://api.forecast.io/'
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
        probeTitle: 'ForecastIOCurrent',
        scaleTitle: config.unitTemperature === "celsius" ? '°C' : '°F',
        title: self.langFile.current,
        timestamp: 0
    });
    
    self.addDevice('forecast',{
        probeTitle: 'ForecastIOForecast',
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
    var self = this;
    pressureHpa = parseInt(pressureHpa);
    if (self.config.unitSystem === "metric") {
        return pressureHpa;
    } else {
        return  Math.round(pressureHpa / 33.8638866667);
    }
};

ForecastIO.prototype.convertTemp = function(tempF) {
    var self = this;
    tempF = parseFloat(tempF);
    if (self.config.unitTemperature === "celsius") {
        return Math.round((tempF -32) * 5 / 9 * 10) / 10;
    } else {
        return tempF;
    }
};

ForecastIO.prototype.convertSpeed = function(speedMs) {
    var self = this;
    speedMs = parseFloat(speedMs);
    if (self.config.unitSystem === "metric") {
        return Math.round(speedMs * 60 * 60 / 1000);
    } else {
        return Math.round(speedMs * 60 * 60 / 1609.34);
    }
};

ForecastIO.prototype.processResponse = function(response) {
    var self        = this;
    
    console.log("[ForecastIO] Update");
    var currentDate = new Date();
    var current     = response.data.currently;
    var forecast0   = response.data.daily.data[0];
    var forecast1   = response.data.daily.data[1];
    
    // Handle current state
    var currentTemperature = self.convertTemp(current.temperature);
    
    self.devices.current.set("metrics:raw",current);
    self.devices.current.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/ForecastIO/condition_"+current.icon+".png");
    self.devices.current.set("metrics:level",currentTemperature);
    self.devices.current.set("metrics:pop",(current.precipProbability * 100));
    self.devices.current.set("metrics:temperature",currentTemperature);
    self.devices.current.set("metrics:weather",current.summary);
    self.devices.current.set("metrics:timestamp",currentDate.getTime());
    self.devices.current.set("metrics:feelslike", self.convertTemp(current.apparentTemperature));
    self.devices.current.set("metrics:ozone",current.ozone);
    self.devices.current.set("metrics:dewpoint",current.dewPoint);
    self.devices.current.set("metrics:percipintensity",current.precipIntensity * 100);
    self.devices.current.set("metrics:cloudcover",current.cloudCover * 100);
    self.devices.current.set("metrics:condition",current.icon);
    self.devices.current.set("metrics:conditiongroup",self.convertCondition(current.icon));
    self.devices.current.set("metrics:low",self.convertTemp(forecast0.temperatureMin));
    self.devices.current.set("metrics:high",self.convertTemp(forecast0.temperatureMax));
    
    // Handle forecast
    var forecastLow = Math.round(self.convertTemp(forecast1.temperatureMin));
    var forecastHigh = Math.round(self.convertTemp(forecast1.temperatureMax));
    
    self.devices.forecast.set("metrics:conditiongroup",self.convertCondition(forecast1.icon));
    self.devices.forecast.set("metrics:condition",forecast1.icon);
    self.devices.forecast.set("metrics:level", forecastLow + ' - ' + forecastHigh);
    self.devices.forecast.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/ForecastIO/condition_"+forecast1.icon+".png");
    self.devices.forecast.set("metrics:pop",(forecast1.precipProbability  * 100));
    self.devices.forecast.set("metrics:percipintensity",forecast1.precipIntensity * 100);
    self.devices.forecast.set("metrics:weather",forecast1.summary);
    self.devices.forecast.set("metrics:high",forecastHigh);
    self.devices.forecast.set("metrics:low",forecastLow);
    
    self.devices.forecast.set("metrics:raw_daily",response.data.daily);
    self.devices.forecast.set("metrics:raw_hourly",response.data.hourly);
    
    // Handle humidity
    if (self.humidityDevice) {
        self.devices.humidity.set("metrics:level", parseFloat(current.humidity) * 100);
    }
    
    // Handle wind
    if (self.windDevice) {
        var wind            = parseInt(current.windSpeed);
        var beaufort = _.findIndex(self.windBeaufort,function(check) {
            return wind < check;
        });
        var icon = _.findIndex(self.windIcons,function(check) {
            return beaufort < check;
        });
        var windConverted   = self.convertSpeed(wind);
        self.devices.wind.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/ForecastIO/wind"+icon+".png");
        self.devices.wind.set("metrics:level", windConverted);
        self.devices.wind.set("metrics:wind", windConverted);
        self.devices.wind.set("metrics:winddregrees", parseFloat(current.windBearing));
        self.devices.wind.set("metrics:beaufort",beaufort);
        self.averageSet(self.devices.wind,'wind',windConverted);
    }
    
    // Handle barometer
    if (self.barometerDevice) {
        self.devices.barometer.set('metrics:level',self.convertPressure(current.pressure));
    }
};

ForecastIO.prototype.convertCondition = function(condition) {
    condition = condition.replace('-night','');
    if (_.contains(["snow","sleet"], condition)) {
        return 'snow';
    } else if (_.contains(["rain",""], condition)) {
        return 'poor';
    } else if (_.contains(["wind","fog","cloudy"], condition)) {
        return 'neutral'
    } else if (_.contains(["clear","partly-cloudy"], condition)) {
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


 
