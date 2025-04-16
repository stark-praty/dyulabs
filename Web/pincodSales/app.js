// Global map variable
let map;
let salesData = [];

const MY_MAPSCO_API_KEY = '67ff83f3367a8312182683riu4d5cac';
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
    fetch('sales_data.csv')
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
        citySales[item.city] = (citySales[item.city] || 0) + quantity;
        
    
        if (!item.latitude || !item.longitude) {
            try {
                const coords = await fetchCoordinates(item.pincode);
                if (coords) {
                    item.latitude = coords.latitude;
                    item.longitude = coords.longitude;
                }
            } catch (error) {
                console.error(`Failed to fetch coordinates for pincode ${item.pincode}:`, error);
                continue;
            }
        }
        
        createMarker(item, quantity);
    }
    

    updateStatistics(totalSales, uniqueLocations.size, uniqueStates.size, deviceCounts, citySales);
    
    // Hide loader
    document.getElementById('loader').style.display = 'none';
}

async function fetchCoordinates(pincode) {
    
    const apiUrl = `https://api.postalpincode.in/pincode/${pincode}`;
    
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }
        
        const data = await response.json();
        
        // Process the API response - this structure will depend on the API you're using
        if (data && data[0] && data[0].Status === 'Success' && data[0].PostOffice && data[0].PostOffice.length > 0) {

            return {
                latitude: 28.6139 + (Math.random() - 0.5) * 2,  // Random offset around Delhi
                longitude: 77.2090 + (Math.random() - 0.5) * 2
            };
        } else {
            throw new Error('No location data found for this pincode');
        }
    } catch (error) {
        console.error(`Error fetching coordinates for pincode ${pincode}:`, error);
        throw error;
    }
}

// async function fetchCoordinates(pincode) {
//     // Use the pincode directly as the query for Maps.co
//     const apiUrl = `https://geocode.maps.co/search?q=${pincode}&api_key=${MY_MAPSCO_API_KEY}`;

//     try {
//         const response = await fetch(apiUrl);

//         if (!response.ok) {
//             // Attempt to read error response for more details
//             let errorDetails = `Status: ${response.status}`;
//             try {
//                 const errorText = await response.text();
//                 errorDetails += `, Body: ${errorText}`;
//             } catch (_) { /* Ignore if reading text fails */ }
//             console.error(`Maps.co API request failed. ${errorDetails}`);
//             return null; // Indicate failure
//         }

//         const data = await response.json();

//         // Check if Maps.co returned any results
//         if (Array.isArray(data) && data.length > 0) {
//             const bestMatch = data[0];
//             // Return the coordinates and display name from the first result
//             return {
//                 latitude: parseFloat(bestMatch.lat),
//                 longitude: parseFloat(bestMatch.lon),
//                 displayName: bestMatch.display_name
//             };
//         } else {
//             console.warn(`Maps.co returned no results for pincode query: ${pincode}`);
//             return null;
//         }
//     } catch (error) {
//         console.error(`Error fetching coordinates from Maps.co for pincode "${pincode}":`, error);
//         return null;
//     }
// }

function createMarker(item, quantity) {
    const markerSize = Math.max(5, Math.min(15, 5 + quantity / 20));
    const marker = L.circleMarker([item.latitude, item.longitude], {
        radius: markerSize,
        fillColor: deviceColors[item.device_type] || '#999',
        color: '#fff',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8
    });
    
    marker.addTo(map).bindPopup(`
        <strong>${item.city}, ${item.state}</strong><br>
        Pin Code: ${item.pincode}<br>
        Device: ${item.device_type}<br>
        Quantity Sold: ${item.quantity_sold}
    `);
}

// Function to update statistics in the sidebar
function updateStatistics(totalSales, locationCount, stateCount, deviceCounts, citySales) {
    document.getElementById('total-sales').textContent = totalSales;
    document.getElementById('total-locations').textContent = locationCount;
    document.getElementById('total-states').textContent = stateCount;
    
    // Display device type statistics
    const deviceStatsDiv = document.getElementById('device-stats');
    deviceStatsDiv.innerHTML = '';
    Object.keys(deviceCounts).forEach(deviceType => {
        const percentage = ((deviceCounts[deviceType] / totalSales) * 100).toFixed(1);
        deviceStatsDiv.innerHTML += `
            <p><strong>${deviceType}:</strong> ${deviceCounts[deviceType]} units (${percentage}%)</p>
        `;
    });
    
    // Display top 5 cities by sales
    const cityStatsDiv = document.getElementById('city-stats');
    cityStatsDiv.innerHTML = '';
    
    Object.entries(citySales)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([city, sales]) => {
            cityStatsDiv.innerHTML += `
                <p style=""><strong>${city}:</strong> ${sales} units</p>
            `;
        });
}

// Function to show error message
function showError(message) {
    const loader = document.getElementById('loader');
    loader.innerHTML = `<div class="error-message">${message}</div>`;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}