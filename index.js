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
    
    this.path               = 'forecast/'
        + config.apiKey.toString()
        + '/'
        + config.latitude.toString()
        + ','
        + config.longitude.toString();
    this.unitTemperature    = config.unitTemperature.toString();
    this.unitSystem         = config.unitSystem.toString();
    this.langFile           = self.controller.loadModuleLang("ForecastIO");
    
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

ForecastIO.prototype.stop = function () {
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
    
    var url = "http://api.forecast.io/"+self.path;
    
    http.request({
        url: url,
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

ForecastIO.prototype.processResponse = function(response) {
    console.log("[ForecastIO] Update");
    
    var self        = this;
    
    var current     = response.data.current_observation;
    var currentDate = new Date();
    var sunrise     = response.data.sun_phase.sunrise;
    var sunset      = response.data.sun_phase.sunset;
    var forecast    = response.data.forecast.simpleforecast.forecastday;
    sunset.hour     = parseInt(sunset.hour);
    sunset.minute   = parseInt(sunset.minute);
    sunrise.hour    = parseInt(sunrise.hour);
    sunrise.minute  = parseInt(sunrise.minute);
    //console.logJS(response.data);
    
    var daynight = (
            currentDate.getHours() > sunrise.hour 
            || 
            (
                currentDate.getHours() === sunrise.hour 
                && currentDate.getMinutes() > sunrise.minute
            )
        ) 
        &&
        (
            currentDate.getHours() < sunset.hour 
            || 
            (
                currentDate.getHours() === sunset.hour 
                && currentDate.getMinutes() < sunset.minute
            )
        ) ? 'day':'night';
    
    // Handle current state
    var currentTemperature = parseFloat(self.config.unitTemperature === "celsius" ? current.temp_c : current.temp_f);
    var currentHigh        = parseFloat(self.config.unitTemperature === "celsius" ? forecast[0].high.celsius : forecast[0].high.fahrenheit);
    var currentLow         = parseFloat(self.config.unitTemperature === "celsius" ? forecast[0].low.celsius : forecast[0].low.fahrenheit);
    self.devices.current.set("metrics:conditiongroup",self.transformCondition(current.icon));
    self.devices.current.set("metrics:condition",current.icon);
    //self.devices.current.set("metrics:title",current.weather);
    self.devices.current.set("metrics:level",currentTemperature);
    self.devices.current.set("metrics:temperature",currentTemperature);
    self.devices.current.set("metrics:icon", "http://icons.wxug.com/i/c/k/"+(daynight === 'night' ? 'nt_':'')+current.icon+".gif");
    self.devices.current.set("metrics:feelslike", parseFloat(self.config.unitTemperature === "celsius" ? current.feelslike_c : current.feelslike_f));
    self.devices.current.set("metrics:weather",current.weather);
    self.devices.current.set("metrics:pop",forecast[0].pop);
    self.devices.current.set("metrics:high",currentHigh);
    self.devices.current.set("metrics:low",currentLow);
    self.devices.current.set("metrics:raw",current);
    self.devices.current.set("metrics:timestamp",currentDate.getTime());
    
    // Handle forecast
    var forecastHigh = parseFloat(self.config.unitTemperature === "celsius" ? forecast[1].high.celsius : forecast[1].high.fahrenheit);
    var forecastLow = parseFloat(self.config.unitTemperature === "celsius" ? forecast[1].low.celsius : forecast[1].low.fahrenheit);
    self.devices.forecast.set("metrics:conditiongroup",self.transformCondition(forecast[1].icon));
    self.devices.forecast.set("metrics:condition",forecast[1].icon);
    //self.devices.current.set("metrics:title",forecast[1].weather);
    self.devices.forecast.set("metrics:level", forecastLow + ' - ' + forecastHigh);
    self.devices.forecast.set("metrics:icon", "http://icons.wxug.com/i/c/k/"+forecast[1].icon+".gif");
    self.devices.forecast.set("metrics:pop",forecast[1].pop);
    self.devices.forecast.set("metrics:weather",forecast[1].conditions);
    self.devices.forecast.set("metrics:high",forecastHigh);
    self.devices.forecast.set("metrics:low",forecastLow);
    self.devices.forecast.set("metrics:raw",forecast);
    
    // Handle humidity
    if (self.humidityDevice) {
        self.devices.humidity.set("metrics:level", parseInt(current.relative_humidity));
    }
    
    // Handle wind
    if (self.windDevice) {
        var wind = (parseInt(current.wind_kph) + parseInt(current.wind_gust_kph)) / 2;
        var windLevel = 0;
        if (wind >= 62) { // Beaufort 8
            windLevel = 3;
        } else if (wind >= 39) { // Beaufort 6
            windLevel = 2;
        } else if (wind >= 12) { // Beaufort 3
            windLevel = 1;
        }
        self.devices.wind.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/ForecastIO/wind"+windLevel+".png");
        self.devices.wind.set("metrics:level", (self.config.unitSystem === "metric" ? current.wind_kph : current.wind_mph));
        self.devices.wind.set("metrics:dir", current.wind_dir);
        self.devices.wind.set("metrics:wind", parseFloat(self.config.unitSystem === "metric" ? current.wind_kph : current.wind_mph));
        self.devices.wind.set("metrics:windgust", parseFloat(self.config.unitSystem === "metric" ? current.wind_gust_kph : current.wind_gust_mph));
        self.devices.wind.set("metrics:winddregrees", parseFloat(current.wind_degrees));
        self.devices.wind.set("metrics:windlevel",windLevel);
        self.averageSet(self.devices.wind,'wind',wind);
    }
    
    // Handle barometer
    if (self.barometerDevice) {
        var pressure = parseFloat(self.config.unitSystem === "metric" ? current.pressure_mb : current.pressure_in);
        self.devices.barometer.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/ForecastIO/barometer"+current.pressure_trend+".png");
        self.devices.barometer.set('metrics:level',pressure);
        self.devices.barometer.set('metrics:trend',current.pressure_trend);
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


 
