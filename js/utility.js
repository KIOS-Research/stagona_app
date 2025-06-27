// Utility function to check if a string contains HTML tags
function containsHtmlTags(str) {
    return /<[^>]*>/g.test(str);
}

// Utility function to safely update element content based on HTML presence
function updateElementContent(element, content) {
    if (containsHtmlTags(content)) {
        element.innerHTML = content;
    } else {
        element.textContent = content;
    }
}