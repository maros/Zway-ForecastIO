# Zway-ForecastIO

Zway Automation module for fetching current condition and forecasts from the
ForecastIO API. Creates virtual devices for humidity, wind, current 
conditions and forecasts.

See https://developer.forecast.io/ for details.

# Configuration

## latitude, longitude

Location for weather forecast

## unitTemperature

Display temperatures in Celsius or Fahrenheit

## unitSystem

Display metric or imperial units for air pressure and wind speed

## apiKey

Required API key for accessing the service. See 
https://developer.forecast.io/register for obtaining an API key.

## windDevice, humidityDevice, barometerDevice

Flag that sets if devices should be created

# Virtual Devices

This module creates up to five virtual devices

## Current conditions

Displays the current condition as an icon and the current temperature. 
Additionally the following metrics are set

*    metrics:level Current temperature
*    metrics:temperature
*    metrics:condition
*    metrics:conditiongroup: fair,neutral,rain or snow
*    metrics:feelslike: Felt temperature
*    metrics:ozone: Ozone level
*    metrics:dewpoint: Dewpoint temperature
*    metrics:cloudcover: Cloud cover [0-100]
*    metrics:weather: Current weather summary (only in English) 
*    metrics:pop: probability of precipitation [0-100]
*    metrics:high: expected high temperature today
*    metrics:low: expected low temperature today
*    metrics:raw: raw current conditions data returned by the API

## Forecast

Displays the forecasted condition as an icon, and the expected temperature 
range.

*    metrics:level Forecast temperature range
*    metrics:condition
*    metrics:conditiongroup: fair,neutral,rain or snow
*    metrics:weather: Forecast summary (only in English)
*    metrics:pop: probability of precipitation
*    metrics:percipintensity: intensity of percipitation
*    metrics:high: expected high temperature today
*    metrics:low: expected low temperature today
*    metrics:raw_daily: raw daily forecast data returned by the API
*    metrics:raw_hourly: raw hourly forecast data

## Wind

Displays the current wind speed. Wind strength is indicated by the icon.

*    metrics:level: Wind speed
*    metrics:dir: Wind direction
*    metrics:wind_avg: Wind average of last three updates
*    metrics:winddregrees: Wind degrees
*    metrics:beaufort: Wind strength in beaufort [0-12]

## Humidity

Displays the current humidity.

## Barometer

Displays the current air pressure.

# Events

No events are emitted

# Installation

```shell
cd /opt/z-way-server/automation/modules
git clone https://github.com/maros/Zway-ForecastIO.git ForecastIO --branch latest
```

To update or install a specific version
```shell
cd /opt/z-way-server/automation/modules/ForecastIO
git fetch --tags
# For latest released version
git checkout tags/latest
# For a specific version
git checkout tags/1.02
# For development version
git checkout -b master --track origin/master
```

# License

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or any 
later version.

Climate icons from http://adamwhitcroft.com/climacons/

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.
