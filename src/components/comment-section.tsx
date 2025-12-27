'use client';

import { useState } from 'react';
import type { Comment } from '@/lib/data';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CommentSectionProps {
  comments: Comment[];
}

export default function CommentSection({ comments: initialComments }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [newComment, setNewComment] = useState('');
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newComment.trim()) {
      // In a real app, this would be a server action.
      // We simulate adding a comment here.
      const pseudoRandomId = `#${Math.random().toString(16).slice(2, 10)}`;
      const locations = ['[GB, London]', '[AU, Sydney]', '[CA, Toronto]'];
      const randomLocation = locations[Math.floor(Math.random() * locations.length)];
      
      const newCommentData: Comment = {
        id: `c${comments.length + 10}`,
        authorId: pseudoRandomId,
        location: randomLocation,
        text: newComment,
        timestamp: 'Just now',
      };

      setComments(prev => [newCommentData, ...prev]);
      setNewComment('');
      toast({
        title: "Comment Posted",
        description: "Thank you for your contribution.",
      });
    }
  };

  return (
    <section>
      <h2 className="mb-6 font-headline text-3xl font-bold">Discussion</h2>
      <Card>
        <CardHeader>
          <form onSubmit={handleSubmit}>
            <Textarea
              placeholder="Join the discussion... what are your thoughts?"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={3}
            />
            <Button type="submit" className="mt-4">Post Comment</Button>
          </form>
        </CardHeader>
        <CardContent>
          {comments.length > 0 ? (
            <div className="space-y-6">
              {comments.map(comment => (
                <div key={comment.id} className="flex space-x-4">
                  <div className="flex-shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <MessageSquare className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 text-sm">
                      <span className="font-semibold text-muted-foreground">{comment.location}</span>
                      <span className="font-mono text-xs text-muted-foreground">{comment.authorId}</span>
                      <span className="text-xs text-muted-foreground">&middot;</span>
                      <span className="text-xs text-muted-foreground">{comment.timestamp}</span>
                    </div>
                    <p className="mt-1 text-foreground">{comment.text}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-muted-foreground">Be the first to comment.</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
