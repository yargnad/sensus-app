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
        <form onSubmit={handleSubmit}>
            <div>
                <textarea
                    placeholder="Share a poem or a thought..."
                    value={text}
                    onChange={(e) => {
                        setText(e.target.value);
                        setFile(null);
                    }}
                    rows="4"
                    cols="50"
                ></textarea>
            </div>
            <div>
                <p>OR</p>
            </div>
            <div>
                <input
                    type="file"
                    accept="image/*,audio/*"
                    onChange={(e) => {
                        setFile(e.target.files[0]);
                        setText('');
                    }}
                />
            </div>
            <button type="submit">Submit</button>
        </form>
    );
};

export default SubmissionForm;