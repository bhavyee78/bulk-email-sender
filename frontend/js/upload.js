/**
 * Upload Module
 * 
 * Handles file upload functionality:
 * - Drag and drop
 * - File selection
 * - Upload progress
 * - Results display
 */

function initUpload() {
    const dropzone = document.getElementById('uploadDropzone');
    const fileInput = document.getElementById('fileInput');
    const uploadProgress = document.getElementById('uploadProgress');
    const uploadProgressFill = document.getElementById('uploadProgressFill');
    const uploadProgressText = document.getElementById('uploadProgressText');
    const uploadResults = document.getElementById('uploadResults');
    
    // Click to select file
    dropzone.addEventListener('click', () => {
        fileInput.click();
    });
    
    // File selected
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });
    
    // Drag and drop events
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    
    dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
    });
    
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileUpload(files[0]);
        }
    });
    
    // Handle file upload
    async function handleFileUpload(file) {
        // Validate file type
        const validTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv'
        ];
        const validExtensions = ['.xlsx', '.xls', '.csv'];
        
        const extension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
        
        if (!validExtensions.includes(extension)) {
            Toast.error('Invalid File', 'Please upload an Excel (.xlsx, .xls) or CSV file.');
            return;
        }
        
        // Show progress
        uploadProgress.classList.remove('hidden');
        uploadResults.classList.add('hidden');
        uploadProgressFill.style.width = '0%';
        uploadProgressText.textContent = 'Uploading...';
        
        // Simulate progress (since fetch doesn't give us upload progress easily)
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += 10;
            if (progress <= 90) {
                uploadProgressFill.style.width = `${progress}%`;
            }
        }, 100);
        
        try {
            const result = await API.upload('/contacts/upload', file);
            
            // Complete progress
            clearInterval(progressInterval);
            uploadProgressFill.style.width = '100%';
            uploadProgressText.textContent = 'Processing complete!';
            
            // Show results
            setTimeout(() => {
                uploadProgress.classList.add('hidden');
                showUploadResults(result);
            }, 500);
            
            // Refresh contacts list
            loadContacts();
            
            // Update quota display
            loadQuota();
            
            // Show success toast
            Toast.success(
                'Upload Successful',
                `Imported ${result.stats.inserted} contacts`
            );
            
        } catch (error) {
            clearInterval(progressInterval);
            uploadProgress.classList.add('hidden');
            
            Toast.error('Upload Failed', error.message);
        }
        
        // Reset file input
        fileInput.value = '';
    }
    
    function showUploadResults(result) {
        const { stats, errors } = result;
        
        uploadResults.classList.remove('hidden');
        
        document.getElementById('statInserted').textContent = stats.inserted;
        document.getElementById('statSkipped').textContent = stats.skipped;
        document.getElementById('statInvalid').textContent = stats.invalidRows;
        
        // If there were errors, show warning
        if (errors && errors.length > 0) {
            const errorMessages = errors.slice(0, 5).map(e => 
                `Row ${e.row}: ${e.errors.join(', ')}`
            ).join('\n');
            
            Toast.warning(
                `${errors.length} rows had issues`,
                errors.length > 5 
                    ? `Showing first 5:\n${errorMessages}\n...and ${errors.length - 5} more`
                    : errorMessages
            );
        }
    }
}
