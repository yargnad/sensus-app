import React, { useState, useEffect } from 'react';
import './App.css';
import SubmissionForm from './components/SubmissionForm';
import MatchedContent from './components/MatchedContent';
import CooldownTimer from './components/CooldownTimer';
import ErrorBoundary from './components/ErrorBoundary';

const API_URL = 'http://localhost:5000';

function App() {
    const [showForm, setShowForm] = useState(false);
    const [matchedContent, setMatchedContent] = useState(null);
    const [waiting, setWaiting] = useState(false);
    const [submissionId, setSubmissionId] = useState(null);
    const [cooldownTime, setCooldownTime] = useState(null);

    useEffect(() => {
        const lastSubmissionTime = localStorage.getItem('sensus_last_submission');
        const lastSubmissionId = localStorage.getItem('sensus_submission_id');

        if (lastSubmissionTime) {
            const twentyFourHours = 24 * 60 * 60 * 1000;
            const timePassed = Date.now() - new Date(lastSubmissionTime).getTime();

            if (timePassed < twentyFourHours) {
                setCooldownTime(twentyFourHours - timePassed);
                if (lastSubmissionId) {
                    fetch(`${API_URL}/api/check/${lastSubmissionId}`)
                        .then(res => res.json())
                        .then(data => {
                            if (data.status === 'matched') {
                                setMatchedContent(data.matchData);
                            }
                        })
                        .catch(err => console.error("Error fetching last match:", err));
                }
            } else {
                localStorage.removeItem('sensus_last_submission');
                localStorage.removeItem('sensus_submission_id');
                localStorage.removeItem('sensus_session_token');
            }
        }
    }, []);

    useEffect(() => {
        if (!waiting || !submissionId) return;

        const intervalId = setInterval(() => {
            fetch(`${API_URL}/api/check/${submissionId}`)
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'matched') {
                        setMatchedContent(data.matchData);
                        setWaiting(false);
                        localStorage.setItem('sensus_submission_id', submissionId);
                        setSubmissionId(null);
                    }
                })
                .catch(err => {
                    console.error("Error checking status:", err);
                    setWaiting(false);
                });
        }, 5000);

        return () => clearInterval(intervalId);
    }, [waiting, submissionId]);

    const handleShareClick = () => setShowForm(true);

    const handleSubmission = async (formData) => {
        setShowForm(false);
        setWaiting(true);

        try {
            const res = await fetch(`${API_URL}/api/submit`, { method: 'POST', body: formData });
            const data = await res.json();
            const twentyFourHours = 24 * 60 * 60 * 1000;
            const submissionTime = data.lastSubmissionTime || data.submissionTime;
            const timePassed = Date.now() - new Date(submissionTime).getTime();
            setCooldownTime(twentyFourHours - timePassed);

            if (res.status === 429) {
                setWaiting(false);
                if (data.lastSubmissionId) {
                    fetch(`${API_URL}/api/check/${data.lastSubmissionId}`)
                        .then(res => res.json())
                        .then(matchData => {
                            if (matchData.status === 'matched') setMatchedContent(matchData.matchData);
                        });
                }
                return;
            }

            localStorage.setItem('sensus_session_token', data.sessionToken);
            localStorage.setItem('sensus_last_submission', data.submissionTime);
            localStorage.setItem('sensus_submission_id', data.submissionId);

            if (data.status === 'matched') {
                setMatchedContent(data.matchData);
                setWaiting(false);
            } else if (data.status === 'waiting') {
                setSubmissionId(data.submissionId);
            }
        } catch (error) {
            console.error("Error during submission:", error);
            setWaiting(false);
        }
    };

    let mainContent;
    if (matchedContent) {
        mainContent = <MatchedContent content={matchedContent} apiUrl={API_URL} />;
    } else if (waiting) {
        mainContent = <div className="waiting-message">Waiting for a match...</div>;
    } else if (cooldownTime > 0) {
        mainContent = <div className="waiting-message">Retrieving your last match...</div>;
    } else {
        mainContent = showForm
            ? <SubmissionForm onSubmit={handleSubmission} />
            : <button className="share-button" onClick={handleShareClick}>Share a Feeling</button>;
    }

    return (
        <ErrorBoundary>
            <div className="App">
                {cooldownTime > 0 && (
                    <div className="cooldown-timer-wrapper">
                        <CooldownTimer initialTime={cooldownTime} />
                    </div>
                )}
                <div className="content-frame">
                    {mainContent}
                </div>
            </div>
        </ErrorBoundary>
    );
}

export default App;