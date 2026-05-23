import { describe, expect, it } from "vitest";
import {
    mergeAndDedupeEntities,
    normalizeCelestrakSatellites,
    normalizeFirmsCsv,
    normalizeGdacsEvents,
    normalizeGpsJamming,
    normalizeMeteoFranceAlerts,
    normalizeNdbcLatest,
    normalizeNwsAlerts,
    normalizeOpenMeteoAirQuality,
} from "./normalizers";
import type { FeedEntity } from "./types";

function entity(overrides: Partial<FeedEntity>): FeedEntity {
    const {
        properties,
        ...rest
    } = overrides;
    return {
        id: "e",
        pluginId: "flood-alerts",
        latitude: 0,
        longitude: 0,
        timestamp: new Date("2026-05-22T00:00:00.000Z"),
        ...rest,
        properties: {
            sourceScope: "global",
            sourceName: "test",
            eventType: "flood",
            ...properties,
        },
    };
}

describe("global feed normalizers", () => {
    it("filters France GDACS events when country metadata identifies France", () => {
        const items = normalizeGdacsEvents("flood-alerts", {
            features: [
                {
                    id: "fr-1",
                    geometry: { type: "Point", coordinates: [2.2, 46.2] },
                    properties: { country: "France", eventname: "Flood France" },
                },
                {
                    id: "it-1",
                    geometry: { type: "Point", coordinates: [12.4, 41.9] },
                    properties: { country: "Italy", eventname: "Flood Italy" },
                },
            ],
        }, "flood");

        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            pluginId: "flood-alerts",
            properties: { sourceScope: "global", sourceName: "GDACS", country: "Italy" },
        });
    });

    it("normalizes CelesTrak GP JSON orbital elements", () => {
        const items = normalizeCelestrakSatellites([{
            OBJECT_NAME: "ISS (ZARYA)",
            OBJECT_ID: "1998-067A",
            EPOCH: "2026-05-22T12:28:18.496128",
            MEAN_MOTION: 15.49313075,
            ECCENTRICITY: 0.0007537,
            INCLINATION: 51.633,
            RA_OF_ASC_NODE: 67.1668,
            ARG_OF_PERICENTER: 86.3178,
            MEAN_ANOMALY: 273.8672,
            EPHEMERIS_TYPE: 0,
            CLASSIFICATION_TYPE: "U",
            NORAD_CAT_ID: 25544,
            ELEMENT_SET_NO: 999,
            REV_AT_EPOCH: 56777,
            BSTAR: 0.00013945,
            MEAN_MOTION_DOT: 0.00007327,
            MEAN_MOTION_DDOT: 0,
        }], "stations", new Date("2026-05-23T10:00:00.000Z"));

        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            pluginId: "satellites",
            label: "ISS (ZARYA)",
            properties: {
                sourceName: "CelesTrak",
                orbitGroup: "stations",
                noradId: "25544",
            },
        });
        expect(Number.isFinite(items[0].latitude)).toBe(true);
        expect(Number.isFinite(items[0].longitude)).toBe(true);
        expect((items[0].altitude ?? 0) > 100_000).toBe(true);
    });

    it("normalizes GPS jamming engine items", () => {
        const items = normalizeGpsJamming({
            source: "gpsjam_mock",
            items: [{
                id: "jam-1",
                lat: 47.42,
                lon: 36.26,
                interferenceLevel: "high",
                timestamp: "2026-05-23T00:00:00.000Z",
                region: "Eastern Europe / Ukraine",
            }],
        });

        expect(items).toEqual([
            expect.objectContaining({
                pluginId: "gps-jamming",
                latitude: 47.42,
                longitude: 36.26,
                properties: expect.objectContaining({
                    sourceName: "gpsjam_mock",
                    interferenceLevel: "high",
                    region: "Eastern Europe / Ukraine",
                }),
            }),
        ]);
    });

    it("dedupes global France-adjacent events when a France item is equivalent", () => {
        const global = [
            entity({
                id: "global-fr",
                latitude: 46.23,
                longitude: 2.21,
                properties: { sourceScope: "global", sourceName: "GDACS", eventType: "flood" },
            }),
            entity({
                id: "global-it",
                latitude: 41.9,
                longitude: 12.5,
                properties: { sourceScope: "global", sourceName: "GDACS", eventType: "flood", country: "Italy" },
            }),
        ];
        const france = [
            entity({
                id: "france",
                latitude: 46.24,
                longitude: 2.2,
                properties: { sourceScope: "france", sourceName: "Vigicrues", eventType: "flood", country: "France" },
            }),
        ];

        const merged = mergeAndDedupeEntities(global, france);

        expect(merged.map((item) => item.id)).toEqual(["global-it", "france"]);
    });

    it("normalizes Meteo-France items under the parent tropical cyclones plugin", () => {
        const items = normalizeMeteoFranceAlerts([
            {
                id: "gp",
                lat: 16.25,
                lon: -61.58,
                phenomenon: "cyclone",
                level: "orange",
            },
        ]);

        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            pluginId: "tropical-cyclones",
            latitude: 16.25,
            longitude: -61.58,
            properties: {
                sourceScope: "france",
                sourceName: "Meteo-France",
                eventType: "tropical-cyclone",
            },
        });
    });

    it("normalizes NASA FIRMS CSV hotspots", () => {
        const items = normalizeFirmsCsv([
            "latitude,longitude,bright_ti4,acq_date,acq_time,satellite,confidence,frp",
            "34.1,-118.2,331.5,2026-05-23,0942,N,high,12.4",
        ].join("\n"));

        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            pluginId: "wildfire-hotspots",
            latitude: 34.1,
            longitude: -118.2,
            properties: {
                sourceName: "NASA FIRMS",
                confidence: "high",
                brightness: 331.5,
            },
        });
    });

    it("normalizes Open-Meteo air quality fallback rows", () => {
        const items = normalizeOpenMeteoAirQuality([{
            city: "Paris",
            latitude: 48.8566,
            longitude: 2.3522,
            current: { time: "2026-05-23T10:00", pm2_5: 9.4 },
        }]);

        expect(items[0]).toMatchObject({
            pluginId: "air-quality",
            properties: {
                sourceName: "Open-Meteo Air Quality",
                parameter: "pm25",
                value: 9.4,
            },
        });
    });

    it("normalizes NOAA NDBC latest observations with station coordinates", () => {
        const items = normalizeNdbcLatest(
            [
                "#STN YY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES ATMP WTMP DEWP VIS PTDY TIDE",
                "41001 2026 05 23 10 00 180 7.2 9.8 1.4 8 6 170 1012.3 22.1 20.4 MM MM MM",
            ].join("\n"),
            { "41001": { name: "East Hatteras", latitude: 34.7, longitude: -72.7 } },
        );

        expect(items[0]).toMatchObject({
            pluginId: "marine-buoys",
            latitude: 34.7,
            longitude: -72.7,
            properties: {
                sourceName: "NOAA NDBC",
                stationId: "41001",
                waveHeight: 1.4,
            },
        });
    });

    it("normalizes NWS alert features under the US-only feed", () => {
        const items = normalizeNwsAlerts({
            features: [{
                id: "alert-1",
                geometry: { type: "Point", coordinates: [-97.7, 30.2] },
                properties: {
                    event: "Severe Thunderstorm Warning",
                    severity: "Severe",
                    urgency: "Immediate",
                    areaDesc: "Travis County",
                    effective: "2026-05-23T10:00:00Z",
                    expires: "2026-05-23T11:00:00Z",
                },
            }],
        });

        expect(items[0]).toMatchObject({
            pluginId: "us-weather-alerts",
            properties: {
                sourceScope: "us",
                sourceName: "NOAA/NWS",
                scopeLabel: "US only",
            },
        });
    });
});
