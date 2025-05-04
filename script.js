// Global variables to store data
let globalItems = [];
let boxesMap = {}; // Maps box IDs to full box details including contents
let caseToBoxMap = {}; // Maps case itemdefid to generator itemdefid

// Fetch data from external JSON file
document.addEventListener('DOMContentLoaded', async function() {
    try {
        const response = await fetch('data.json');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        globalItems = data.items;

        // Process data and build box map
        processItemData();

        // Hide loading indicator and show main content
        document.getElementById('loading-indicator').classList.add('hidden');
        document.getElementById('main-content').classList.remove('hidden');

        initializeUI();
    } catch (error) {
        console.error('Error fetching data:', error);
        document.getElementById('loading-indicator').classList.add('hidden');
        document.getElementById('error-container').classList.remove('hidden');
    }
});

function processItemData() {
    // Create a map of itemdefid -> item for faster lookups
    const itemsById = {};
    globalItems.forEach(item => {
        itemsById[item.itemdefid] = item;
    });

    // Find case and box relationships using exchange
    const generatorCasePairs = []; // Store generator and case pairs

    // First pass: Find all generators and their exchange item (case)
    globalItems.forEach(item => {
        if (item.type === 'generator' && item.exchange) {
            const exchangeItems = parseExchange(item.exchange);
            if (exchangeItems.length > 0) {
                generatorCasePairs.push({
                    generatorId: item.itemdefid,
                    caseId: exchangeItems[0],
                    generator: item
                });
            }
        }
    });

    // Second pass: Update the case-to-box mapping
    generatorCasePairs.forEach(pair => {
        const caseItem = itemsById[pair.caseId];
        if (caseItem) {
            caseToBoxMap[pair.caseId] = pair.generatorId;
            // Store the case icon URL in the generator for display
            if (pair.generator && caseItem.icon_url) {
                pair.generator.box_icon_url = caseItem.icon_url;
            }
        }
    });

    // Process all boxes (generators with bundles)
    globalItems.forEach(item => {
        if (item.type === 'generator' && item.bundle) {
            const contents = parseBundle(item.bundle);
            if (contents.length === 0) return;

            // Calculate the sum of all weights
            const totalWeight = contents.reduce((sum, c) => sum + c.weight, 0);

            // Store full details of each box, including processed contents
            boxesMap[item.itemdefid] = {
                ...item,
                contents: contents.map(c => {
                    const contentItem = itemsById[c.id];
                    if (!contentItem) return null;

                    const percentage = (c.weight / totalWeight) * 100;
                    return {
                        ...contentItem,
                        weight: c.weight,
                        percentage: percentage.toFixed(2)
                    };
                }).filter(i => i !== null)
            };

            // Sort contents by percentage descending
            boxesMap[item.itemdefid].contents.sort((a, b) =>
                parseFloat(b.percentage) - parseFloat(a.percentage)
            );
        }
    });
}

function parseExchange(exchangeString) {
    // Parse exchange string format: "itemdefid:quantity;itemdefid:quantity"
    if (!exchangeString) return [];

    try {
        return exchangeString.split(';')
            .map(part => {
                const [id, quantity] = part.split(':');
                return parseInt(id);
            });
    } catch (e) {
        console.error("Error parsing exchange string:", exchangeString, e);
        return [];
    }
}

function parseBundle(bundleString) {
    // Parse bundle string format: "itemdefid:weight;itemdefid:weight"
    if (!bundleString) return [];

    try {
        return bundleString.split(';')
            .map(part => {
                const [id, weight] = part.split(':');
                return {
                    id: parseInt(id),
                    weight: parseFloat(weight)
                };
            });
    } catch (e) {
        console.error("Error parsing bundle string:", bundleString, e);
        return [];
    }
}

function initializeUI() {
    // Populate UI elements
    populateItemsGrid();
    populateBoxesGrid();
    populateBoxFilter();

    // Add event listeners for interactive elements
    setupSearchAndFilter();
    setupModal();

    // Initialize item counts and filter summary
    updateFilterSummary();
}

function populateItemsGrid() {
    const container = document.getElementById('items-container');
    container.innerHTML = '';

    // Get current filter values
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const rarityFilter = document.getElementById('rarity-filter').value;
    const boxFilter = document.getElementById('box-filter').value;
    const sortBy = document.getElementById('sort-by').value;

    // Apply filters to items
    let filteredItems = globalItems.filter(item => {
        // Skip non-wearable items and generators
        if (item.type !== 'wearable' || item.tags?.includes('bundle')) return false;

        // Apply search filter
        if (searchTerm && !item.name.toLowerCase().includes(searchTerm)) return false;

        // Apply rarity filter
        if (rarityFilter !== 'all') {
            const itemRarity = determineRarity(item);
            if (itemRarity.toLowerCase() !== rarityFilter) return false;
        }

        // Apply box filter
        if (boxFilter !== 'all') {
            // Check if the item is in the selected box
            const box = boxesMap[boxFilter];
            if (!box) return false;

            const inBox = box.contents.some(content => content.itemdefid === item.itemdefid);
            if (!inBox) return false;
        }

        return true;
    });

    // Sort items
    filteredItems.sort((a, b) => {
        switch(sortBy) {
            case 'name':
                return a.name.localeCompare(b.name);
            case 'name-desc':
                return b.name.localeCompare(a.name);
            case 'rarity-desc':
                const rarityA = determineRarity(a);
                const rarityB = determineRarity(b);
                return rarityOrder(rarityB) - rarityOrder(rarityA);
            case 'rarity-asc':
                const rarityC = determineRarity(a);
                const rarityD = determineRarity(b);
                return rarityOrder(rarityC) - rarityOrder(rarityD);
            default:
                return 0;
        }
    });

    // Create cards for each item
    filteredItems.forEach(item => {
        const bgColor = item.background_color || getDefaultBgColor(determineRarity(item));
        const nameColor = item.name_color || getDefaultNameColor(determineRarity(item));
        const rarity = determineRarity(item);

        const itemEl = document.createElement('div');
        itemEl.className = 'bg-white rounded-lg shadow-md overflow-hidden transition-transform hover:scale-105 hover:shadow-lg';
        itemEl.setAttribute('data-itemdefid', item.itemdefid);

        // Find which boxes this item can be found in
        const sourceBoxes = [];
        Object.values(boxesMap).forEach(box => {
            box.contents.forEach(content => {
                if (content.itemdefid === item.itemdefid) {
                    sourceBoxes.push({
                        boxName: box.name,
                        boxId: box.itemdefid,
                        percentage: content.percentage,
                        icon_url: box.box_icon_url || box.icon_url
                    });
                }
            });
        });

        itemEl.innerHTML = `
            <div class="w-full h-48 bg-[#${bgColor}] flex items-center justify-center relative">
                <img src="${item.icon_url}" alt="${item.name}" class="max-w-[80%] max-h-[80%]">
                ${sourceBoxes.length > 0 ? `
                    <div class="absolute bottom-2 right-2 flex gap-1">
                        ${sourceBoxes.slice(0, 3).map(box => `
                            <div class="w-6 h-6 bg-white bg-opacity-75 rounded-md flex items-center justify-center tooltip-trigger">
                                <img src="${box.icon_url}" alt="${box.boxName}" class="max-w-[80%] max-h-[80%]">
                                <div class="tooltip-content hidden absolute bottom-8 right-0 bg-black bg-opacity-75 text-white text-xs p-2 rounded">
                                    ${box.boxName}: ${box.percentage}%
                                </div>
                            </div>
                        `).join('')}
                        ${sourceBoxes.length > 3 ? `
                            <div class="w-6 h-6 bg-white bg-opacity-75 rounded-md flex items-center justify-center text-xs font-bold">
                                +${sourceBoxes.length - 3}
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
            <div class="p-4">
                <h3 class="text-[#${nameColor}] font-semibold mb-1 truncate">${item.name}</h3>
                <div class="flex justify-between items-center">
                    <span class="text-sm bg-[#${bgColor}] bg-opacity-20 text-[#${bgColor}] px-2 py-1 rounded-full">${rarity}</span>
                    <button class="view-details text-blue-500 hover:text-blue-700 text-sm">
                        View Details
                    </button>
                </div>
            </div>
        `;

        // Add event for view details button
        itemEl.querySelector('.view-details').addEventListener('click', () => {
            openItemModal(item);
        });

        // Add tooltip triggers
        const tooltipTriggers = itemEl.querySelectorAll('.tooltip-trigger');
        tooltipTriggers.forEach(trigger => {
            trigger.addEventListener('mouseenter', () => {
                trigger.querySelector('.tooltip-content').classList.remove('hidden');
            });
            trigger.addEventListener('mouseleave', () => {
                trigger.querySelector('.tooltip-content').classList.add('hidden');
            });
        });

        container.appendChild(itemEl);
    });

    // Update the filter summary
    updateFilterSummary(filteredItems.length);
}

function populateBoxesGrid() {
    const container = document.getElementById('boxes-container');
    container.innerHTML = '';

    Object.values(boxesMap).forEach(box => {
        const boxEl = document.createElement('div');
        boxEl.className = 'bg-white rounded-lg shadow-md overflow-hidden';
        boxEl.setAttribute('data-boxid', box.itemdefid);

        // Get icon from the box or its related case
        const boxIconUrl = box.box_icon_url || box.icon_url;

        boxEl.innerHTML = `
            <div class="p-4 border-b flex items-center">
                <div class="w-14 h-14 flex items-center justify-center mr-4">
                    <img src="${boxIconUrl}" alt="${box.name}" class="max-w-full max-h-full">
                </div>
                <div>
                    <h3 class="font-semibold text-lg">${box.name}</h3>
                    <p class="text-sm text-gray-500">${box.contents.length} items available</p>
                </div>
            </div>
            <div class="p-4">
                <h4 class="font-medium mb-2">Contents Preview:</h4>
                <div class="flex flex-wrap gap-2 mb-4">
                    ${box.contents.slice(0, 6).map(item => {
            const bgColor = item.background_color || getDefaultBgColor(determineRarity(item));
            return `
                            <div class="tooltip-trigger">
                                <div class="w-12 h-12 bg-[#${bgColor}] rounded-md flex items-center justify-center">
                                    <img src="${item.icon_url}" alt="${item.name}" class="max-w-[80%] max-h-[80%]">
                                </div>
                                <div class="tooltip-content hidden absolute bg-black bg-opacity-75 text-white text-xs p-2 rounded z-10">
                                    ${item.name}<br>
                                    ${item.percentage}% chance
                                </div>
                            </div>
                        `;
        }).join('')}
                    ${box.contents.length > 6 ? `
                        <div class="w-12 h-12 bg-gray-100 rounded-md flex items-center justify-center text-sm text-gray-500 font-medium">
                            +${box.contents.length - 6}
                        </div>
                    ` : ''}
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-sm text-gray-500">${getRarityDistribution(box.contents)}</span>
                    <button class="view-box-details text-blue-500 hover:text-blue-700 text-sm">
                        View All Items
                    </button>
                </div>
            </div>
        `;

        // Add event listener for the View All Items button
        boxEl.querySelector('.view-box-details').addEventListener('click', () => {
            document.getElementById('box-filter').value = box.itemdefid;
            document.getElementById('box-filter').dispatchEvent(new Event('change'));

            // Smooth scroll to the items section
            document.getElementById('items-container').scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });

            // Highlight the box for a moment
            const boxFilterEl = document.getElementById('box-filter');
            boxFilterEl.classList.add('highlight-box');
            setTimeout(() => {
                boxFilterEl.classList.remove('highlight-box');
            }, 2000);
        });

        // Add event listeners for tooltips
        boxEl.addEventListener('DOMNodeInserted', () => {
            const tooltipTriggers = boxEl.querySelectorAll('.tooltip-trigger');
            tooltipTriggers.forEach(trigger => {
                trigger.addEventListener('mouseenter', () => {
                    const tooltip = trigger.querySelector('.tooltip-content');
                    tooltip.classList.remove('hidden');
                });
                trigger.addEventListener('mouseleave', () => {
                    const tooltip = trigger.querySelector('.tooltip-content');
                    tooltip.classList.add('hidden');
                });
            });
        });

        container.appendChild(boxEl);
    });
}

function populateBoxFilter() {
    const boxFilter = document.getElementById('box-filter');

    // Clear existing options except "All Boxes"
    while (boxFilter.options.length > 1) {
        boxFilter.remove(1);
    }

    // Add option for each box
    Object.values(boxesMap).forEach(box => {
        const option = document.createElement('option');
        option.value = box.itemdefid;
        option.textContent = box.name;
        boxFilter.appendChild(option);
    });
}

function setupSearchAndFilter() {
    // Set up event handlers for search and filter controls
    document.getElementById('search-input').addEventListener('input', populateItemsGrid);
    document.getElementById('rarity-filter').addEventListener('change', populateItemsGrid);
    document.getElementById('box-filter').addEventListener('change', populateItemsGrid);
    document.getElementById('sort-by').addEventListener('change', populateItemsGrid);

    // Reset filters button
    document.getElementById('reset-filters').addEventListener('click', () => {
        document.getElementById('search-input').value = '';
        document.getElementById('rarity-filter').value = 'all';
        document.getElementById('box-filter').value = 'all';
        document.getElementById('sort-by').value = 'name';

        populateItemsGrid();
    });
}

function setupModal() {
    // Set up event handlers for the modal
    document.getElementById('close-modal').addEventListener('click', () => {
        document.getElementById('item-modal').classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    });

    // Close modal when clicking outside content
    document.getElementById('item-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('item-modal')) {
            document.getElementById('item-modal').classList.add('hidden');
            document.body.classList.remove('overflow-hidden');
        }
    });

    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !document.getElementById('item-modal').classList.contains('hidden')) {
            document.getElementById('item-modal').classList.add('hidden');
            document.body.classList.remove('overflow-hidden');
        }
    });
}

function openItemModal(item) {
    // Update modal content with item details
    document.getElementById('modal-title').textContent = item.name;

    // Set image with appropriate background color
    const bgColor = item.background_color || getDefaultBgColor(determineRarity(item));
    document.getElementById('modal-image-container').style.backgroundColor = `#${bgColor}`;
    document.getElementById('modal-image').src = item.icon_url;
    document.getElementById('modal-image').alt = item.name;

    // Set rarity badge
    const rarityBadge = document.getElementById('modal-rarity');
    const rarity = determineRarity(item);
    rarityBadge.textContent = rarity;
    rarityBadge.style.backgroundColor = `#${bgColor}20`; // 20% opacity
    rarityBadge.style.color = `#${bgColor}`;

    // Set description
    document.getElementById('modal-description').textContent =
        item.description || `A ${rarity.toLowerCase()} ${item.type} item from Poly Plaza.`;

    // Marketable status
    const marketableEl = document.getElementById('modal-marketable');
    if (item.marketable) {
        marketableEl.innerHTML = `
            <span class="text-green-600">
                <i class="fas fa-check-circle mr-1"></i> Marketable
            </span>
        `;
    } else {
        marketableEl.innerHTML = `
            <span class="text-red-600">
                <i class="fas fa-times-circle mr-1"></i> Not Marketable
            </span>
        `;
    }

    // Market actions
    const marketActionsEl = document.getElementById('modal-market-actions');
    marketActionsEl.innerHTML = '';

    if (item.marketable) {
        const marketBtn = document.createElement('a');
        marketBtn.href = `https://steamcommunity.com/market/listings/2716030/${encodeURIComponent(item.name)}`;
        marketBtn.className = 'bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm';
        marketBtn.innerHTML = '<i class="fas fa-shopping-cart mr-1"></i> View on Market';
        marketBtn.target = '_blank';
        marketActionsEl.appendChild(marketBtn);
    }

    // Find drop rates in boxes
    const dropRatesEl = document.getElementById('modal-drop-rates');
    dropRatesEl.innerHTML = '';

    // Check which boxes this item is in
    const sourcesFound = [];

    Object.values(boxesMap).forEach(box => {
        const contentItem = box.contents.find(c => c.itemdefid === item.itemdefid);
        if (contentItem) {
            sourcesFound.push({
                boxName: box.name,
                boxIcon: box.box_icon_url || box.icon_url,
                percentage: contentItem.percentage,
                boxId: box.itemdefid
            });
        }
    });

    if (sourcesFound.length > 0) {
        sourcesFound.forEach(source => {
            const sourceEl = document.createElement('div');
            sourceEl.className = 'flex items-center justify-between bg-gray-50 p-3 rounded';
            sourceEl.innerHTML = `
                <div class="flex items-center">
                    <div class="w-10 h-10 flex items-center justify-center mr-3">
                        <img src="${source.boxIcon}" alt="${source.boxName}" class="max-w-full max-h-full">
                    </div>
                    <div>
                        <h4 class="font-medium">${source.boxName}</h4>
                        <p class="text-sm text-gray-500">Drop chance: <span class="font-semibold">${source.percentage}%</span></p>
                    </div>
                </div>
                <button class="text-blue-500 hover:text-blue-700 view-box-from-modal" data-box-id="${source.boxId}">
                    View Box
                </button>
            `;

            sourceEl.querySelector('.view-box-from-modal').addEventListener('click', () => {
                // Close the modal
                document.getElementById('item-modal').classList.add('hidden');
                document.body.classList.remove('overflow-hidden');

                // Set the box filter and scroll to the box section
                document.getElementById('box-filter').value = source.boxId;
                document.getElementById('box-filter').dispatchEvent(new Event('change'));

                // Find and highlight the box element
                setTimeout(() => {
                    const boxEl = document.querySelector(`[data-boxid="${source.boxId}"]`);
                    if (boxEl) {
                        boxEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        boxEl.classList.add('highlight-box');
                        setTimeout(() => {
                            boxEl.classList.remove('highlight-box');
                        }, 2000);
                    }
                }, 100);
            });

            dropRatesEl.appendChild(sourceEl);
        });
    } else {
        dropRatesEl.innerHTML = `
            <div class="text-gray-500 italic">
                This item is not available from any current boxes.
            </div>
        `;
    }

    // Show the modal
    document.getElementById('item-modal').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

function updateFilterSummary(count = 0) {
    const filterSummary = document.getElementById('filter-summary');
    const searchTerm = document.getElementById('search-input').value;
    const rarityFilter = document.getElementById('rarity-filter').value;
    const boxFilter = document.getElementById('box-filter').value;

    let summaryText = `Showing ${count} items`;

    const filters = [];
    if (searchTerm) filters.push(`matching "${searchTerm}"`);
    if (rarityFilter !== 'all') filters.push(`with ${rarityFilter} rarity`);
    if (boxFilter !== 'all') {
        const boxName = document.getElementById('box-filter').options[document.getElementById('box-filter').selectedIndex].text;
        filters.push(`from "${boxName}"`);
    }

    if (filters.length > 0) {
        summaryText += ' ' + filters.join(', ');
    }

    filterSummary.textContent = summaryText;
}

function getRarityDistribution(contents) {
    // Count items by rarity
    const counts = {
        legendary: 0,
        epic: 0,
        rare: 0,
        common: 0
    };

    contents.forEach(item => {
        const rarity = determineRarity(item).toLowerCase();
        if (counts[rarity] !== undefined) {
            counts[rarity]++;
        }
    });

    // Build distribution text
    const parts = [];
    if (counts.legendary > 0) parts.push(`${counts.legendary} Legendary`);
    if (counts.epic > 0) parts.push(`${counts.epic} Epic`);
    if (counts.rare > 0) parts.push(`${counts.rare} Rare`);
    if (counts.common > 0) parts.push(`${counts.common} Common`);

    return parts.join(', ');
}

function determineRarity(item) {
    // Determine rarity based on tags or color
    if (item.tags && item.tags.includes('rarity:legendary')) return 'Legendary';
    if (item.tags && item.tags.includes('rarity:epic')) return 'Epic';
    if (item.tags && item.tags.includes('rarity:rare')) return 'Rare';
    if (item.tags && item.tags.includes('rarity:common')) return 'Common';

    // Fallback to color if no tags
    if (item.background_color) {
        const color = item.background_color.toLowerCase();
        if (color === 'f39c12' || color === 'e67e22') return 'Legendary';
        if (color === '9b59b6') return 'Epic';
        if (color === '3498db') return 'Rare';
        if (color === '95a5a6' || color === '7f8c8d') return 'Common';
    }

    // Default
    return 'Common';
}

function rarityOrder(rarity) {
    switch(rarity.toLowerCase()) {
        case 'legendary': return 4;
        case 'epic': return 3;
        case 'rare': return 2;
        case 'common': return 1;
        default: return 0;
    }
}

function getDefaultBgColor(rarity) {
    switch(rarity.toLowerCase()) {
        case 'legendary': return 'f39c12';
        case 'epic': return '9b59b6';
        case 'rare': return '3498db';
        case 'common': return '95a5a6';
        default: return '7f8c8d';
    }
}

function getDefaultNameColor(rarity) {
    switch(rarity.toLowerCase()) {
        case 'legendary': return 'e67e22';
        case 'epic': return '9b59b6';
        case 'rare': return '3498db';
        default: return '7f8c8d';
    }
}
