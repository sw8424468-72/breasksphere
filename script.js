function calculateWave() {
    // Get input values
    const swellHeight = parseFloat(document.getElementById('swell_height').value);
    const swellPeriod = parseFloat(document.getElementById('swell_period').value);
    const swellDir = parseFloat(document.getElementById('swell_dir').value);
    const beachOrientation = parseFloat(document.getElementById('beach_orientation').value);
    const windSpeed = parseFloat(document.getElementById('wind_speed').value);
    const windDir = parseFloat(document.getElementById('wind_dir').value);
    const tideHeight = parseFloat(document.getElementById('tide_height').value);
    const tideTrend = document.getElementById('tide_trend').value;
    const distanceToBuoy = parseFloat(document.getElementById('distance_to_buoy').value);

    // Validate inputs
    if (isNaN(swellHeight) || isNaN(swellPeriod) || isNaN(distanceToBuoy)) {
        alert('Please fill in all required fields');
        return;
    }

    // Calculate wave
    const result = calculateGhostNodeYield(
        swellHeight, swellPeriod, swellDir, beachOrientation,
        windSpeed, windDir, tideHeight, tideTrend, distanceToBuoy
    );

    // Display results
    displayResults(result);
}

function calculateGhostNodeYield(swellHeight, swellPeriod, swellDir, beachOrientation, 
                                  windSpeed, windDir, tideHeight, tideTrend, distanceToBuoy) {
    
    // STEP 1: BATHYMETRY SHELF TAX (Distance Decay)
    const k = 0.005; // friction coefficient
    let attenuatedHeight = swellHeight * Math.exp(-k * distanceToBuoy);
    
    // DETAILED VARIABLE: THE PERIOD SUSTAIN & SHOALING FACTOR
    let periodMultiplier, decayResistance;
    
    if (swellPeriod >= 14) {
        periodMultiplier = 1.40;
        decayResistance = 0.5;
    } else if (swellPeriod >= 11) {
        periodMultiplier = 1.15;
        decayResistance = 0.8;
    } else if (swellPeriod <= 6) {
        periodMultiplier = 0.70;
        decayResistance = 1.5;
    } else {
        periodMultiplier = 1.00;
        decayResistance = 1.0;
    }
    
    // Adjust attenuation with decay resistance
    attenuatedHeight = swellHeight * Math.exp(-(k * decayResistance) * distanceToBuoy);
    
    // STEP 2: THE GEOMETRIC BETA-GATE
    let relativeAngle = Math.abs(swellDir - beachOrientation) % 360;
    if (relativeAngle > 180) {
        relativeAngle = 360 - relativeAngle;
    }
    
    // Check if wave is blocked
    if (relativeAngle > 90) {
        return {
            peakEnergyHeight: 0.0,
            status: "BLOCKED",
            textureStatus: "N/A",
            speedSeconds: swellPeriod,
            driftVector: 0.0
        };
    }
    
    // Convert to radians
    const radAngle = (relativeAngle * Math.PI) / 180;
    const cosEfficiency = Math.cos(radAngle);
    const sinDrift = Math.sin(radAngle);
    
    // Calculate bar height
    let barHeight = attenuatedHeight * cosEfficiency * periodMultiplier;
    
    // STEP 3: THE UNDERWATER VARIABLE (Tide Shift)
    let tideModifier;
    if (tideHeight <= 1.0) {
        tideModifier = 1.25;
    } else if (tideHeight >= 4.0) {
        tideModifier = 0.75;
    } else {
        tideModifier = 1.00;
    }
    
    // Ebb tide effect
    if (tideTrend === "EBB") {
        tideModifier *= 1.10;
    }
    
    // STEP 4: THE ABOVE-WATER VARIABLE (Wind Texture)
    let windRelative = Math.abs(windDir - beachOrientation) % 360;
    if (windRelative > 180) {
        windRelative = 360 - windRelative;
    }
    
    let windModifier, texture;
    if (windRelative > 135) {
        // Offshore wind
        windModifier = windSpeed < 20 ? 1.05 : 0.90;
        texture = "CLEAN / OFFSHORE";
    } else if (windRelative < 45) {
        // Onshore wind
        windModifier = 1.0 - (windSpeed * 0.015);
        texture = "CHOPPY / ONSHORE";
    } else {
        // Side-offshore
        windModifier = 1.0;
        texture = "SIDE-TEXTURE";
    }
    
    // STEP 5: THE MELTING POT OUTPUT
    const finalCalculatedHeight = Math.max(0.0, barHeight * tideModifier * windModifier);
    const longshoreDriftIntensity = attenuatedHeight * sinDrift;
    
    return {
        peakEnergyHeight: Math.round(finalCalculatedHeight * 10) / 10,
        speedSeconds: swellPeriod,
        driftVector: Math.round(longshoreDriftIntensity * 100) / 100,
        textureStatus: texture,
        status: "ACCEPTED"
    };
}

function displayResults(result) {
    const resultSection = document.getElementById('result-section');
    
    document.getElementById('result-height').textContent = 
        result.status === "BLOCKED" ? "BLOCKED" : result.peakEnergyHeight + ' ft';
    document.getElementById('result-period').textContent = result.speedSeconds + ' sec';
    document.getElementById('result-texture').textContent = result.textureStatus;
    document.getElementById('result-drift').textContent = result.driftVector;
    document.getElementById('result-status').textContent = result.status;
    
    // Show result section
    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth' });
}

function downloadCalculator() {
    // Get all input values
    const swellHeight = document.getElementById('swell_height').value;
    const swellPeriod = document.getElementById('swell_period').value;
    const swellDir = document.getElementById('swell_dir').value;
    const beachOrientation = document.getElementById('beach_orientation').value;
    const windSpeed = document.getElementById('wind_speed').value;
    const windDir = document.getElementById('wind_dir').value;
    const tideHeight = document.getElementById('tide_height').value;
    const tideTrend = document.getElementById('tide_trend').value;
    const distanceToBuoy = document.getElementById('distance_to_buoy').value;

    // Get results if available
    const resultHeightText = document.getElementById('result-height').textContent;
    const resultPeriodText = document.getElementById('result-period').textContent;
    const resultTextureText = document.getElementById('result-texture').textContent;
    const resultDriftText = document.getElementById('result-drift').textContent;
    const resultStatusText = document.getElementById('result-status').textContent;

    // Create CSV content
    let csvContent = "Ghost Node Wave Calculator Results\n";
    csvContent += "====================================\n\n";
    csvContent += "INPUT PARAMETERS:\n";
    csvContent += `Swell Height,${swellHeight} ft\n`;
    csvContent += `Swell Period,${swellPeriod} sec\n`;
    csvContent += `Swell Direction,${swellDir}°\n`;
    csvContent += `Beach Orientation,${beachOrientation}°\n`;
    csvContent += `Wind Speed,${windSpeed} knots\n`;
    csvContent += `Wind Direction,${windDir}°\n`;
    csvContent += `Tide Height,${tideHeight} ft\n`;
    csvContent += `Tide Trend,${tideTrend}\n`;
    csvContent += `Distance to Buoy,${distanceToBuoy} miles\n\n`;

    if (resultHeightText !== '-') {
        csvContent += "RESULTS:\n";
        csvContent += `Calculated Wave Height,${resultHeightText}\n`;
        csvContent += `Period,${resultPeriodText}\n`;
        csvContent += `Wave Texture,${resultTextureText}\n`;
        csvContent += `Longshore Drift,${resultDriftText}\n`;
        csvContent += `Status,${resultStatusText}\n`;
    }

    // Create blob and download
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent));
    element.setAttribute('download', 'wave_calculator_results.csv');
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}
