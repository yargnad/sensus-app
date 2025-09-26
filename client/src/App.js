import React, { useState, useEffect } from 'react';
import './App.css';
import SubmissionForm from './components/SubmissionForm';
import MatchedContent from './components/MatchedContent';
import CooldownTimer from './components/CooldownTimer';
import ErrorBoundary from './components/ErrorBoundary';

const API_URL = `http://${window.location.hostname}:5000`;

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

        // Set cooldown immediately on the client side to prevent re-submission on refresh
        const submissionTime = new Date();
        const twentyFourHours = 24 * 60 * 60 * 1000;
        localStorage.setItem('sensus_last_submission', submissionTime.toISOString());
        setCooldownTime(twentyFourHours);

        try {
            const sessionToken = localStorage.getItem('sensus_session_token');
            if (sessionToken) {
                formData.append('sessionToken', sessionToken);
            }

            const res = await fetch(`${API_URL}/api/submit`, { method: 'POST', body: formData });
            const data = await res.json();

            // If the server responds with a 429, it means we were already in a cooldown period.
            // We should sync our timer with the server's more accurate time.
            if (res.status === 429) {
                const serverSubmissionTime = data.lastSubmissionTime;
                const timePassed = Date.now() - new Date(serverSubmissionTime).getTime();
                setCooldownTime(twentyFourHours - timePassed);
                localStorage.setItem('sensus_last_submission', serverSubmissionTime);
                
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

            // If submission is successful, store the new session token and submission ID
            localStorage.setItem('sensus_session_token', data.sessionToken);
            localStorage.setItem('sensus_submission_id', data.submissionId);
            // We already set the submission time, but we can sync with the server's official time
            localStorage.setItem('sensus_last_submission', data.submissionTime);


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