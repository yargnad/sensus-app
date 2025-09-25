import React from 'react';

const MatchedContent = ({ content, apiUrl }) => {
    const getFileUrl = (filePath) => {
        // The server is configured to serve static files from the 'uploads' directory
        return `${apiUrl}/${filePath}`;
    };

    return (
        <div className="content-frame">
            <div className="matched-content">
                {content.contentType === 'text' && <p>{content.content}</p>}
                {content.contentType === 'image' && (
                    <img src={getFileUrl(content.content)} alt="A feeling from another" />
                )}
                {content.contentType === 'audio' && (
                    <audio controls src={getFileUrl(content.content)} />
                )}
            </div>
        </div>
    );
};

export default MatchedContent;