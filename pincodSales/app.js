// Global map variable
let map;
let salesData = [];

// Device colors mapping
const deviceColors = {
    'Smartphone': '#4285F4',  // Blue
    'Tablet': '#EA4335',      // Red
    'Laptop': '#34A853'       // Green
};

document.addEventListener('DOMContentLoaded', function() {

    map = L.map('map').setView([22.3511, 78.6677], 5);
    
    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19
}).addTo(map);
    
    // Load CSV data
    loadCSVData();
});


function loadCSVData() {
    fetch('sales_data_wcord.csv')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load CSV file');
            }
            return response.text();
        })
        .then(csvText => {
            Papa.parse(csvText, {
                header: true,
                complete: function(results) {
                    salesData = results.data;
                    processSalesData();
                },
                error: function(error) {
                    showError('Error parsing CSV: ' + error.message);
                }
            });
        })
        .catch(error => {
            showError('Error loading CSV: ' + error.message);
        });
}


async function processSalesData() {
    salesData = salesData.filter(item => item.pincode && item.city && item.state && item.device_type && item.quantity_sold);

    let totalSales = 0;
    const uniqueLocations = new Set();
    const uniqueStates = new Set();
    const deviceCounts = {};
    const citySales = {};

    for (const item of salesData) {
        const quantity = parseInt(item.quantity_sold) || 0;
        totalSales += quantity;
        uniqueLocations.add(item.pincode);
        uniqueStates.add(item.state);

        // Count devices by type
        deviceCounts[item.device_type] = (deviceCounts[item.device_type] || 0) + quantity;
        // Count sales by city
        citySales[`${item.city},${item.state}`] = (citySales[`${item.city},${item.state}`] || 0) + quantity;
        try {
            const coords = await fetchCoordinates(item.pincode);
            if (coords) {
                item.latitude = coords.latitude;
                item.longitude = coords.longitude;
                createMarker(item, quantity); // Create marker only after fetching coordinates
            } else {
                console.warn(`Could not fetch coordinates for pincode ${item.pincode}. Marker not created.`);
            }
        } catch (error) {
            console.error(`Failed to fetch coordinates for pincode ${item.pincode}:`, error);
            continue;
        }
    }
    updateStatistics(totalSales, uniqueLocations.size, uniqueStates.size, deviceCounts, citySales);
    // Hide loader
    document.getElementById('loader').style.display = 'none';
}

async function fetchCoordinates(pincode) {
    const apiUrl = `https://api.olamaps.io/places/v1/geocode?address=${pincode}&language=English&api_key=${OLA_API}`;

    try {
        const response = await fetch(apiUrl, {
            headers: {
                'Authorization': `Bearer ${OLA_BEARER_TOKEN}`,
                'accept': 'application/json'
            }
        });
        // const response = await fetch(apiUrl);

        if (!response.ok) {
            // Attempt to read error response for more details
            const errorData = await response.json();
            console.error(`Ola Maps Geocode API error for pincode ${pincode}:`, errorData);
            throw new Error(`Ola Maps Geocode API request failed with status ${response.status}`);
        }

        const data = await response.json();

        if (data && data.geocodingResults && data.geocodingResults.length > 0) {
            const firstResult = data.geocodingResults[0];
            if (firstResult.geometry && firstResult.geometry.location) {
                return {
                    latitude: parseFloat(firstResult.geometry.location.lat),
                    longitude: parseFloat(firstResult.geometry.location.lng)
                };
            } else {
                console.warn(`No coordinates found in the response for pincode ${pincode} from Ola Maps.`);
                return null;
            }
        } else {
            console.warn(`No results found for pincode ${pincode} using Ola Maps.`);
            return null;
        }

    } catch (error) {
        console.error(`Error fetching coordinates for pincode ${pincode} from Ola Maps:`, error);
        return null;
    }
}

function createMarker(item, quantity) {
    const markerSize = Math.max(5, Math.min(15, 5 + quantity / 20));
    const { latitude, longitude, city, state, pincode, device_type, quantity_sold } = item;
    const fillColor = deviceColors[device_type] || '#999';

    const marker = L.circleMarker([latitude, longitude], {
        radius: markerSize,
        fillColor: fillColor,
        color: '#fff',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8
    });

    marker.addTo(map).bindPopup(`
        <strong>${city}, ${state}</strong><br>
        Pin Code: ${pincode}<br>
        Device: ${device_type}<br>
        Quantity Sold: ${quantity_sold}
    `);
}

// Function to update statistics in the sidebar
function updateStatistics(totalSales, locationCount, stateCount, deviceCounts, citySales) {
    document.getElementById('total-sales').textContent = totalSales;
    document.getElementById('total-locations').textContent = locationCount;
    document.getElementById('total-states').textContent = stateCount;

    const deviceStatsDiv = document.getElementById('device-stats');
    deviceStatsDiv.innerHTML = '';
    for (const [deviceType, count] of Object.entries(deviceCounts)) {
        const percentage = ((count / totalSales) * 100).toFixed(1);
        deviceStatsDiv.innerHTML += `<p><strong>${deviceType}:</strong> ${count} units (${percentage}%)</p>`;
    }

    const cityStatsDiv = document.getElementById('city-stats');
    cityStatsDiv.innerHTML = '';
    Object.entries(citySales)
        .sort(([, salesA], [, salesB]) => salesB - salesA)
        .slice(0, 5)
        .forEach(([city, sales]) => {
            cityStatsDiv.innerHTML += `<p style=""><strong>${city}:</strong> ${sales} units</p>`;
        });
}

// Function to show error message
function showError(message) {
    const loader = document.getElementById('loader');
    loader.innerHTML = `<div class="error-message">${message}</div>`;
}

// function delay(ms) {
//     return new Promise(resolve => setTimeout(resolve, ms));
// }