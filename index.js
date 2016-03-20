/*** ForecastIO Z-Way HA module *******************************************

Version: 1.01
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

ForecastIO.prototype.deviceTypes = ['wind','humidity','barometer','forecastLow','forecastHigh'];
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
    3,
    6,
    Number.POSITIVE_INFINITY
];

ForecastIO.prototype.init = function (config) {
    ForecastIO.super_.prototype.init.call(this, config);

    var self = this;
    
    self.unitTemperature    = config.unitTemperature.toString();
    self.unitSystem         = config.unitSystem.toString();
    self.langFile           = self.controller.loadModuleLang("ForecastIO");
    var scaleTemperature    = self.unitTemperature === "celsius" ? '°C' : '°F';
    
    this.url                = 'https://api.forecast.io/'
        + 'forecast/'
        + config.apiKey.toString()
        + '/'
        + config.latitude.toString()
        + ','
        + config.longitude.toString()
        + '?exclude=flags,alerts&lang='
        + self.controller.defaultLang;
    
    self.addDevice('current',{
        probeType: 'temperature',
        probeTitle: 'ForecastIOCurrent',
        scaleTitle: scaleTemperature,
        title: self.langFile.current,
        timestamp: 0
    });
    
    self.addDevice('forecast',{
        probeType: 'temperature_forecast',
        probeTitle: 'ForecastIOForecast',
        scaleTitle: scaleTemperature,
        title: self.langFile.forecast
    });
    
    if (self.config.humidityDevice) {
        self.addDevice('humidity',{
            probeType: 'humidity',
            icon: '/ZAutomation/api/v1/load/modulemedia/ForecastIO/humidity.png',
            scaleTitle: '%',
            title: self.langFile.humidity
        });
    }
    
    if (self.config.forecastLowDevice) {
        self.addDevice('forecastLow',{
            probeType: 'temperature_forecast_low',
            icon: 'temperature',
            scaleTitle: scaleTemperature,
            title: self.langFile.forecastLow
        });
    }
    
    if (self.config.forecastHighDevice) {
        self.addDevice('forecastHigh',{
            probeType: 'temperature_forecast_high',
            icon: 'temperature',
            scaleTitle: scaleTemperature,
            title: self.langFile.forecastHigh
        });
    }
    
    if (self.config.windDevice) {
        self.addDevice('wind',{
            probeType: 'wind',
            scaleTitle: config.unitSystem === "metric" ? 'km/h' : 'mph',
            title: self.langFile.wind
        });
    }
    
    if (self.config.barometerDevice) {
        self.addDevice('barometer',{
            probeType: 'barometer',
            scaleTitle: config.unitSystem === "metric" ? 'hPa' : 'inHg',
            icon: '/ZAutomation/api/v1/load/modulemedia/ForecastIO/barometer.png',
            title: self.langFile.barometer
        });
    }
    
    var currentTime     = (new Date()).getTime();
    var currentLevel    = self.devices.current.get('metrics:level');
    var updateTime      = self.devices.current.get('metrics:timestamp');
    var intervalTime    = parseInt(self.config.interval) * 60 * 1000;
    
    self.timer = setInterval(function() {
        self.fetchWeather(self);
    }, intervalTime);
    
    if (typeof(updateTime) === 'undefined') {
        self.fetchWeather(self);
    } else {
        console.log('[ForecastIO] Last update time '+updateTime);
        if ((updateTime + intervalTime / 3) < currentTime) {
            self.fetchWeather(self);
        }
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
    
    var probeTitle  = defaults.probeTitle || '';
    var scaleTitle  = defaults.scaleTitle || '';
    var probeType   = defaults.probeType || prefix;
    delete defaults.probeType;
    delete defaults.probeTitle;
    delete defaults.scaleTitle;
    
    var deviceParams = {
        overlay: { 
            deviceType: "sensorMultilevel",
            proveType: probeType,
            metrics: { 
                probeTitle: probeTitle,
                scaleTitle: scaleTitle
            }
        },
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
        success: function(response) { self.processResponse(response); },
        error: function(response) {
            console.error("[ForecastIO] Update error: "+response.statusText);
            console.logJS(response);
            self.controller.addNotification(
                "error", 
                self.langFile.error_fetch, 
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

ForecastIO.prototype.convertInch = function(inch) {
    var self = this;
    inch = parseFloat(inch);
    if (self.config.unitSystem === "metric") {
        return inch * 2.54 * 10;
    } else {
        return inch;
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
    self.devices.current.set("metrics:percipintensity",self.convertInch(current.precipIntensity));
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
    self.devices.forecast.set("metrics:percipintensity",self.convertInch(forecast1.precipIntensity));
    self.devices.forecast.set("metrics:weather",forecast1.summary);
    self.devices.forecast.set("metrics:high",forecastHigh);
    self.devices.forecast.set("metrics:low",forecastLow);
    
    self.devices.forecast.set("metrics:raw_daily",response.data.daily);
    self.devices.forecast.set("metrics:raw_hourly",response.data.hourly);
    
    // Forecast low/high humidity
    if (self.config.forecastLowDevice) {
        self.devices.forecastLow.set("metrics:level", forecastLow);
    }
    if (self.config.forecastHighDevice) {
        self.devices.forecastHigh.set("metrics:level", forecastHigh);
    }
    
    // Handle humidity
    if (self.config.humidityDevice) {
        self.devices.humidity.set("metrics:level", parseFloat(current.humidity) * 100);
    }
    
    // Handle wind
    if (self.config.windDevice) {
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
    if (self.config.barometerDevice) {
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
        return 'neutral';
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


 
