// Chart instance reference
let durationChart = null;

window.renderDurationChart = function(chartData) {
    const ctx = document.getElementById('durationChart');
    
    if (!ctx) {
        console.error('Chart canvas not found');
        return;
    }

    // Destroy existing chart if it exists
    if (durationChart) {
        durationChart.destroy();
    }

    // Extract game info for tooltips
    const gameInfo = chartData.datasets[0].gameInfo || [];

    // Create new chart
    durationChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: chartData.datasets[0].label,
                data: chartData.datasets[0].data,
                borderColor: chartData.datasets[0].borderColor,
                backgroundColor: chartData.datasets[0].backgroundColor,
                borderWidth: chartData.datasets[0].borderWidth,
                fill: chartData.datasets[0].fill,
                tension: chartData.datasets[0].tension,
                pointRadius: chartData.datasets[0].pointRadius,
                pointHoverRadius: chartData.datasets[0].pointHoverRadius,
                pointBackgroundColor: chartData.datasets[0].pointBackgroundColor,
                pointBorderColor: chartData.datasets[0].pointBorderColor,
                pointBorderWidth: chartData.datasets[0].pointBorderWidth
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#b0b0b0',
                        font: {
                            size: 14,
                            weight: '600'
                        },
                        padding: 15
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(26, 26, 26, 0.95)',
                    titleColor: '#e91e63',
                    bodyColor: '#ffffff',
                    borderColor: '#e91e63',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        title: function(context) {
                            const index = context[0].dataIndex;
                            if (gameInfo[index]) {
                                // Try both PascalCase and camelCase
                                return gameInfo[index].gameTitle || gameInfo[index].GameTitle || 'Unknown Game';
                            }
                            return context[0].label;
                        },
                        label: function(context) {
                            const hours = Math.floor(context.parsed.y);
                            const minutes = Math.round((context.parsed.y - hours) * 60);
                            return `Duration: ${hours}h ${minutes}m`;
                        },
                        afterLabel: function(context) {
                            const index = context.dataIndex;
                            if (gameInfo[index]) {
                                // Try both PascalCase and camelCase
                                const completionDate = gameInfo[index].completionDate || gameInfo[index].CompletionDate;
                                if (completionDate) {
                                    return `Completed: ${completionDate}`;
                                }
                            }
                            return '';
                        }
                    }
                },
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'x',
                        modifierKey: null,
                    },
                    zoom: {
                        wheel: {
                            enabled: true,
                            speed: 0.1,
                        },
                        pinch: {
                            enabled: true
                        },
                        mode: 'x',
                    },
                    limits: {
                        x: {
                            min: 'original',
                            max: 'original'
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(42, 42, 42, 0.5)',
                        lineWidth: 1
                    },
                    ticks: {
                        color: '#b0b0b0',
                        maxRotation: 45,
                        minRotation: 0,
                        font: {
                            size: 11
                        },
                        autoSkip: true,
                        maxTicksLimit: 20
                    },
                    title: {
                        display: true,
                        text: 'Game Completion Number',
                        color: '#e91e63',
                        font: {
                            size: 13,
                            weight: '600'
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(42, 42, 42, 0.5)',
                        lineWidth: 1
                    },
                    ticks: {
                        color: '#b0b0b0',
                        font: {
                            size: 12
                        },
                        callback: function(value) {
                            return value + 'h';
                        }
                    },
                    title: {
                        display: true,
                        text: 'Duration (hours)',
                        color: '#e91e63',
                        font: {
                            size: 13,
                            weight: '600'
                        }
                    }
                }
            }
        }
    });
};

window.resetChartZoom = function() {
    if (durationChart) {
        durationChart.resetZoom();
    }
};

// Ownership pie chart instance
let ownershipChart = null;

window.renderOwnershipChart = function(chartData) {
    const ctx = document.getElementById('ownershipChart');
    
    if (!ctx) {
        console.error('Ownership chart canvas not found');
        return;
    }

    // Destroy existing chart if it exists
    if (ownershipChart) {
        ownershipChart.destroy();
    }

    // Generate colors for pie chart
    const colors = [
        'rgba(233, 30, 99, 0.8)',    // Primary pink
        'rgba(156, 39, 176, 0.8)',   // Purple
        'rgba(33, 150, 243, 0.8)',   // Blue
        'rgba(76, 175, 80, 0.8)',    // Green
        'rgba(255, 152, 0, 0.8)',    // Orange
        'rgba(244, 67, 54, 0.8)',    // Red
        'rgba(0, 188, 212, 0.8)',    // Cyan
        'rgba(255, 193, 7, 0.8)',    // Amber
        'rgba(121, 85, 72, 0.8)',    // Brown
        'rgba(158, 158, 158, 0.8)'   // Grey
    ];

    const borderColors = colors.map(color => color.replace('0.8', '1'));

    // Create new pie chart
    ownershipChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: chartData.labels,
            datasets: [{
                data: chartData.data,
                backgroundColor: colors.slice(0, chartData.labels.length),
                borderColor: borderColors.slice(0, chartData.labels.length),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#b0b0b0',
                        font: {
                            size: 12
                        },
                        padding: 15,
                        boxWidth: 15
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(26, 26, 26, 0.95)',
                    titleColor: '#e91e63',
                    bodyColor: '#ffffff',
                    borderColor: '#e91e63',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
};
