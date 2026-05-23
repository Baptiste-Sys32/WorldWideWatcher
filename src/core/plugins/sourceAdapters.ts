import type {
    GeoEntity,
    PluginContext,
    TimeRange,
    WorldPlugin,
} from "@/core/plugins/PluginTypes";

function getEngineBaseUrl(context: PluginContext): string {
    return context.getEngineUrl().replace(/\/$/, "");
}

function toValidDate(value: unknown): Date {
    const date = new Date(typeof value === "string" || typeof value === "number" ? value : "");
    return Number.isNaN(date.getTime()) ? new Date() : date;
}

function mapCivilUnrestItems(items: unknown[]): GeoEntity[] {
    return items.flatMap((raw) => {
        const item = raw as Record<string, unknown>;
        const lat = item.lat ?? item.latitude;
        const lon = item.lon ?? item.longitude;
        if (typeof lat !== "number" || typeof lon !== "number") return [];
        const timestamp = item.date ? toValidDate(item.date) : new Date();
        return [{
            id: typeof item.id === "string" ? item.id : `civil-unrest-${String(lat)}-${String(lon)}-${timestamp.getTime()}`,
            pluginId: "civil-unrest",
            latitude: lat,
            longitude: lon,
            timestamp,
            properties: {
                type: item.type,
                subType: item.subType,
                actor1: item.actor1,
                actor2: item.actor2,
                fatalities: item.fatalities,
                country: item.country,
                location: item.location,
                date: item.date,
                source: item.source,
                notes: item.notes,
                reportCount: item.reportCount,
            },
        }];
    });
}

function mapConflictEventItems(items: unknown[]): GeoEntity[] {
    return items.map((raw, index) => {
        const item = raw as Record<string, unknown>;
        const properties = item.properties && typeof item.properties === "object"
            ? item.properties as Record<string, unknown>
            : {};
        const timestamp = item.timestamp ?? properties.date;
        return {
            id: typeof item.id === "string" ? item.id : `conflict-event-${index}`,
            pluginId: "conflict-events",
            latitude: item.latitude ?? item.lat,
            longitude: item.longitude ?? item.lon,
            timestamp: toValidDate(timestamp),
            properties,
        };
    }).filter((entity): entity is GeoEntity => typeof entity.latitude === "number" && typeof entity.longitude === "number");
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asStringArray(value: unknown): string {
    return Array.isArray(value) ? value.filter((item) => typeof item === "string").join(", ") : "";
}

function mapCyberThreatItems(items: unknown[]): GeoEntity[] {
    return items.flatMap((raw) => {
        const item = asRecord(raw);
        const latitude = item.lat ?? item.latitude;
        const longitude = item.lon ?? item.longitude;
        if (typeof latitude !== "number" || typeof longitude !== "number") return [];
        const threatType = typeof item.threatType === "string" ? item.threatType : "Other";
        const ip = typeof item.ip === "string" ? item.ip : "unknown";
        const pulseModified = item.pulseModified ?? item.timestamp;
        const pulseId = typeof item.pulseId === "string" ? item.pulseId : undefined;
        return [{
            id: typeof item.id === "string" ? item.id : `cyber-${ip}-${String(latitude)}-${String(longitude)}`,
            pluginId: "cyber-attacks",
            latitude,
            longitude,
            timestamp: toValidDate(pulseModified),
            label: `${threatType}: ${ip}`,
            properties: {
                ip,
                country: item.country,
                city: item.city,
                threatType,
                adversary: item.adversary,
                pulseName: item.pulseName,
                pulseDescription: item.pulseDescription,
                malwareFamilies: asStringArray(item.malwareFamilies),
                tags: asStringArray(item.tags),
                targetedCountries: asStringArray(item.targetedCountries),
                pulseUrl: pulseId ? `https://otx.alienvault.com/pulse/${pulseId}` : undefined,
            },
        }];
    });
}

function extractItems(body: unknown): unknown[] {
    const record = asRecord(body);
    if (Array.isArray(record.data)) return record.data;
    if (Array.isArray(record.items)) return record.items;
    return [];
}

export function applyFetchFallbacks(plugin: WorldPlugin, context: PluginContext): void {
    if (plugin.id === "civil-unrest") {
        const originalFetch = plugin.fetch.bind(plugin);
        plugin.fetch = async (timeRange: TimeRange) => {
            try {
                const primary = await originalFetch(timeRange);
                if (Array.isArray(primary) && primary.length > 0) return primary;
            } catch {
                // Fall through to normalized fallback.
            }
            const res = await fetch(`${getEngineBaseUrl(context)}/api/civil-unrest`);
            if (!res.ok) throw new Error(`Civil Unrest API returned ${res.status}`);
            return mapCivilUnrestItems(extractItems(await res.json()));
        };
    }

    if (plugin.id === "conflict-events") {
        const originalFetch = plugin.fetch.bind(plugin);
        plugin.fetch = async (timeRange: TimeRange) => {
            try {
                const primary = await originalFetch(timeRange);
                if (Array.isArray(primary) && primary.length > 0) return primary;
            } catch {
                // Fall through to normalized fallback.
            }
            const res = await fetch(`${getEngineBaseUrl(context)}/api/conflict-events`);
            if (!res.ok) throw new Error(`Conflict Events API returned ${res.status}`);
            return mapConflictEventItems(extractItems(await res.json()));
        };
    }

    if (plugin.id === "cyber-attacks") {
        plugin.fetch = async () => {
            const res = await fetch(`${getEngineBaseUrl(context)}/api/cyber-attacks`);
            if (!res.ok) throw new Error(`Cyber API returned ${res.status}`);
            return mapCyberThreatItems(extractItems(await res.json()));
        };
    }
}
