import React, { useState } from 'react';

const SubmissionForm = ({ onSubmit }) => {
    const [text, setText] = useState('');
    const [file, setFile] = useState(null);

    const handleSubmit = (e) => {
        e.preventDefault();
        const formData = new FormData();
        if (text) {
            formData.append('text', text);
        } else if (file) {
            formData.append('file', file);
        }
        onSubmit(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="submission-form">
            <div className="form-group">
                <textarea
                    placeholder="Share a poem or a thought..."
                    value={text}
                    onChange={(e) => {
                        setText(e.target.value);
                        setFile(null);
                    }}
                    rows="4"
                ></textarea>
            </div>
            <div className="or-file-container">
                <div className="form-divider">
                    <p>OR</p>
                </div>
                <div className="form-group file-input-group">
                    <label className="file-input-label">
                        Choose File
                        <input
                            type="file"
                            accept="image/*,audio/*"
                            onChange={(e) => {
                                setFile(e.target.files[0]);
                                setText('');
                            }}
                            className="file-input-hidden"
                        />
                    </label>
                    {file && <span className="file-name">{file.name}</span>}
                </div>
            </div>
            <div className="form-group submit-button-group">
                <button type="submit" className="submit-button">Submit</button>
            </div>
        </form>
    );
};

export default SubmissionForm;