export const WEATHER_LAYERS = [
    { id: "weather-temperature", name: "Temperature", description: "Current 2 m temperature overlay" },
    { id: "weather-precipitation", name: "Precipitation", description: "Current rain and snow intensity overlay" },
    { id: "weather-clouds", name: "Clouds", description: "Current cloud cover overlay" },
    { id: "weather-wind", name: "Wind", description: "Current 10 m wind speed and direction overlay" },
] as const;
