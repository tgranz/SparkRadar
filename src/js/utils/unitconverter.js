// One big universal conversion function
export default function UnitConverter(from, fromUnit, toUnit='default') {
    const lengthUnits = ['m', 'km', 'ft', 'mi'];
    const speedUnits = ['m/s', 'km/h', 'mph', 'knots'];

    if (toUnit === 'default') {
        // Will be a settings option later
        return null;
    }

    if (lengthUnits.includes(fromUnit) && lengthUnits.includes(toUnit)) {
        return convertLength(from, fromUnit, toUnit);
    } else if (speedUnits.includes(fromUnit) && speedUnits.includes(toUnit)) {
        return convertSpeed(from, fromUnit, toUnit);
    } else {
        throw new Error(`Unsupported unit conversion: ${fromUnit} to ${toUnit}`);
    }
}

function convertLength(value, from, to) {
    const conversions = {
        m: { km: 0.001, ft: 3.28084, mi: 0.000621371 },
        km: { m: 1000, ft: 3280.84, mi: 0.621371 },
        ft: { m: 0.3048, km: 0.0003048, mi: 0.000189394 },
        mi: { m: 1609.34, km: 1.60934, ft: 5280 }
    };
    return value * conversions[from][to];
}

function convertSpeed(value, from, to) {
    const conversions = {
        'm/s': { 'km/h': 3.6, 'mph': 2.23694, 'knots': 1.94384 },
        'km/h': { 'm/s': 0.277778, 'mph': 0.621371, 'knots': 0.539957 },
        'mph': { 'm/s': 0.44704, 'km/h': 1.60934, 'knots': 0.868976 },
        'knots': { 'm/s': 0.514444, 'km/h': 1.852, 'mph': 1.15078 }
    };
    return value * conversions[from][to];
}